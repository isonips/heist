// A small hand-rolled test runner instead of `hardhat test` (Mocha), which
// goes through the `test` task's built-in "compile first" step and hits
// the same blocked solc downloader as `hardhat compile` — see
// scripts/compile.js's header comment and DECISIONS.md P10. Run via:
//   npx hardhat run scripts/runTests.js --no-compile
// `--no-compile` is what actually matters here: it's the flag that stops
// Hardhat from trying (and failing) to fetch a solc binary before running
// the script. This gives up the goodies (fixtures, snapshots, `it()`
// nesting) but keeps the one thing that actually matters — real EVM
// semantics (revert reasons, gas, block.timestamp) via Hardhat's built-in
// in-process network, exercised against the ABI/bytecode our own solc
// compile step produced.
const { expect } = require('chai')
const hre = require('hardhat')
const { compile } = require('./compile')

const { ethers } = hre

let passed = 0
let failed = 0
const failures = []

async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ok - ${name}`)
  } catch (err) {
    failed++
    failures.push({ name, err })
    console.log(`  FAIL - ${name}`)
    console.log(`    ${err.message}`)
  }
}

async function deploy(contracts, name, signer, ...args) {
  const c = contracts[name]
  const factory = new ethers.ContractFactory(c.abi, c.bytecode, signer)
  const instance = await factory.deploy(...args)
  await instance.waitForDeployment()
  return instance
}

async function main() {
  const contracts = compile()
  const [deployer, alice, bob, recorder, other] = await ethers.getSigners()

  console.log('\nVault')
  {
    const usdg = await deploy(contracts, 'MockUSDG', deployer)
    const vault = await deploy(contracts, 'Vault', deployer, await usdg.getAddress())

    await usdg.mint(alice.address, ethers.parseUnits('1000', 18))
    await usdg.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256)

    await test('deposit credits the depositor\'s balance and pulls tokens in', async () => {
      const amount = ethers.parseUnits('100', 18)
      await vault.connect(alice).deposit(amount)
      expect(await vault.balanceOf(alice.address)).to.equal(amount)
      expect(await usdg.balanceOf(await vault.getAddress())).to.equal(amount)
    })

    await test('withdraw debits balance and returns tokens', async () => {
      const before = await usdg.balanceOf(alice.address)
      await vault.connect(alice).withdraw(ethers.parseUnits('40', 18))
      expect(await vault.balanceOf(alice.address)).to.equal(ethers.parseUnits('60', 18))
      expect(await usdg.balanceOf(alice.address)).to.equal(before + ethers.parseUnits('40', 18))
    })

    await test('withdraw more than balance reverts, does not touch state', async () => {
      const before = await vault.balanceOf(alice.address)
      await expect(vault.connect(alice).withdraw(ethers.parseUnits('1000', 18))).to.be.reverted
      expect(await vault.balanceOf(alice.address)).to.equal(before)
    })

    await test('a depositor cannot withdraw another depositor\'s balance', async () => {
      // bob never deposited — balanceOf[bob] is 0, so any withdraw reverts,
      // regardless of how much alice or the contract holds.
      await expect(vault.connect(bob).withdraw(1)).to.be.reverted
    })

    await test('deposit/withdraw of zero amount reverts', async () => {
      await expect(vault.connect(alice).deposit(0)).to.be.reverted
      await expect(vault.connect(alice).withdraw(0)).to.be.reverted
    })

    await test('withdraw has no owner/pause gate — works from any account with a balance, unconditionally', async () => {
      // Vault has no owner at all (no constructor arg, no Ownable, no
      // pause flag) — this test is really just confirming the ABI has no
      // such function to call, i.e. there is nothing to disable.
      expect(vault.interface.fragments.some((f) => f.name === 'pause' || f.name === 'owner')).to.equal(false)
    })

    await test('reentrant withdraw via a malicious token is blocked', async () => {
      const evil = await deploy(contracts, 'MaliciousReentrantToken', deployer)
      const evilVault = await deploy(contracts, 'Vault', deployer, await evil.getAddress())
      await evil.mint(bob.address, ethers.parseUnits('100', 18))
      await evil.connect(bob).approve(await evilVault.getAddress(), ethers.MaxUint256)
      await evilVault.connect(bob).deposit(ethers.parseUnits('100', 18))

      // Arm the token to re-enter evilVault.withdraw() from inside its own
      // transfer() — fired during the outbound transfer of a first,
      // legitimate withdraw call.
      await evil.setAttack(await evilVault.getAddress(), ethers.parseUnits('50', 18), true)
      await expect(evilVault.connect(bob).withdraw(ethers.parseUnits('50', 18))).to.be.reverted
    })

    await test('solvency: total credited balances never exceed the vault\'s real token balance', async () => {
      const usdg2 = await deploy(contracts, 'MockUSDG', deployer)
      const vault2 = await deploy(contracts, 'Vault', deployer, await usdg2.getAddress())
      const users = [alice, bob, other]
      for (const u of users) {
        await usdg2.mint(u.address, ethers.parseUnits('500', 18))
        await usdg2.connect(u).approve(await vault2.getAddress(), ethers.MaxUint256)
      }
      // A pseudo-random sequence of deposits/withdrawals, checking the
      // invariant after every single step.
      const steps = [
        [alice, 'deposit', 120], [bob, 'deposit', 80], [alice, 'withdraw', 30],
        [other, 'deposit', 200], [bob, 'withdraw', 80], [alice, 'deposit', 10],
        [other, 'withdraw', 199], [alice, 'withdraw', 100],
      ]
      for (const [user, action, amt] of steps) {
        await vault2.connect(user)[action](ethers.parseUnits(String(amt), 18))
        let sum = 0n
        for (const u of users) sum += await vault2.balanceOf(u.address)
        const real = await usdg2.balanceOf(await vault2.getAddress())
        expect(sum).to.equal(real) // exact equality: nothing else ever touches this vault's token balance
      }
    })
  }

  console.log('\nHaulLedger')
  {
    const ledger = await deploy(contracts, 'HaulLedger', deployer, recorder.address)
    const root1 = ethers.keccak256(ethers.toUtf8Bytes('batch-1'))
    const root2 = ethers.keccak256(ethers.toUtf8Bytes('batch-2'))

    await test('recorder can append a batch; batchId increments from 0', async () => {
      const tx = await ledger.connect(recorder).recordBatch(root1)
      await tx.wait()
      expect(await ledger.batchCount()).to.equal(1)
      expect(await ledger.batchRoot(0)).to.equal(root1)
    })

    await test('a second batch gets the next id; the first is untouched', async () => {
      await ledger.connect(recorder).recordBatch(root2)
      expect(await ledger.batchCount()).to.equal(2)
      expect(await ledger.batchRoot(0)).to.equal(root1)
      expect(await ledger.batchRoot(1)).to.equal(root2)
    })

    await test('non-recorder cannot append', async () => {
      await expect(ledger.connect(other).recordBatch(root1)).to.be.reverted
    })

    await test('recording a zero root reverts (no accidental blank batch)', async () => {
      await expect(ledger.connect(recorder).recordBatch(ethers.ZeroHash)).to.be.reverted
    })

    await test('append-only: there is no function to modify or delete an existing batch', async () => {
      const names = ledger.interface.fragments.filter((f) => f.type === 'function').map((f) => f.name)
      expect(names).to.not.include.members(['setBatchRoot', 'deleteBatch', 'updateBatch', 'removeBatch'])
    })

    await test('recorder handoff requires two steps: propose, then accept from the new address', async () => {
      await ledger.connect(recorder).proposeRecorder(other.address)
      // Old recorder still active until accept() — proposing alone changes nothing.
      expect(await ledger.recorder()).to.equal(recorder.address)
      // A random account cannot accept on the nominee's behalf.
      await expect(ledger.connect(bob).acceptRecorder()).to.be.reverted
      await ledger.connect(other).acceptRecorder()
      expect(await ledger.recorder()).to.equal(other.address)
      // Old recorder has lost the role.
      await expect(ledger.connect(recorder).recordBatch(root1)).to.be.reverted
      // New recorder can append.
      await ledger.connect(other).recordBatch(root1)
      expect(await ledger.batchCount()).to.equal(3)
    })
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
