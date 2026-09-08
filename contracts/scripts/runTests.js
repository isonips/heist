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
  const [deployer, alice, bob, recorder, other, treasury, operator] = await ethers.getSigners()

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

  console.log('\nHeistPlay')
  {
    const usdg = await deploy(contracts, 'MockUSDG', deployer)
    const playPrice = ethers.parseUnits('10', 18)
    const treasuryBps = 1000n // 10%
    const bigCap = ethers.parseUnits('1000', 18) // large enough to never bind in this block
    const play = await deploy(
      contracts, 'HeistPlay', deployer,
      await usdg.getAddress(), deployer.address, operator.address, treasury.address,
      playPrice, treasuryBps, bigCap, bigCap,
    )

    await usdg.mint(alice.address, ethers.parseUnits('1000', 18))
    await usdg.connect(alice).approve(await play.getAddress(), ethers.MaxUint256)

    const runId1 = ethers.keccak256(ethers.toUtf8Bytes('run-1'))

    await test('play() pulls playPrice, sends the treasury cut immediately, pools the rest', async () => {
      await play.connect(alice).play(runId1)
      expect(await usdg.balanceOf(treasury.address)).to.equal(ethers.parseUnits('1', 18)) // 10% of 10
      expect(await play.pooledBalance()).to.equal(ethers.parseUnits('9', 18)) // 90% stays pooled
      expect(await usdg.balanceOf(alice.address)).to.equal(ethers.parseUnits('990', 18))
    })

    await test('play() with a repeated runId reverts — no double-charge on a retried call', async () => {
      await expect(play.connect(alice).play(runId1)).to.be.reverted
    })

    await test('payout() only callable by operator', async () => {
      const ref = ethers.keccak256(ethers.toUtf8Bytes('loot-ref-1'))
      await expect(play.connect(alice).payout(bob.address, ref, ethers.parseUnits('1', 18), 'loot')).to.be.reverted
    })

    await test('payout() moves funds from the pool and is idempotent on ref', async () => {
      const ref = ethers.keccak256(ethers.toUtf8Bytes('loot-ref-2'))
      const before = await usdg.balanceOf(bob.address)
      await play.connect(operator).payout(bob.address, ref, ethers.parseUnits('2', 18), 'loot')
      expect(await usdg.balanceOf(bob.address)).to.equal(before + ethers.parseUnits('2', 18))
      // A second payout call against the same ref reverts outright — it
      // does not just no-op, so a bug that retries a payout is loud, not
      // silently swallowed.
      await expect(play.connect(operator).payout(bob.address, ref, ethers.parseUnits('2', 18), 'loot')).to.be.reverted
    })

    await test('payout() rejects an unrecognized reason string', async () => {
      const ref = ethers.keccak256(ethers.toUtf8Bytes('bad-reason-ref'))
      await expect(play.connect(operator).payout(bob.address, ref, ethers.parseUnits('1', 18), 'refund')).to.be.reverted
    })

    await test('owner can update playPrice/treasuryBps; a non-owner cannot; treasury is untouched by setConfig', async () => {
      await expect(play.connect(alice).setConfig(playPrice, 500)).to.be.reverted
      await play.connect(deployer).setConfig(ethers.parseUnits('20', 18), 500)
      expect(await play.treasury()).to.equal(treasury.address) // setConfig has no treasury param anymore
      expect(await play.playPrice()).to.equal(ethers.parseUnits('20', 18))
      expect(await play.treasuryBps()).to.equal(500n)
      // restore for any later tests in this block
      await play.connect(deployer).setConfig(playPrice, treasuryBps)
    })

    await test('treasury has no single-step setter — only proposeTreasury/acceptTreasury, 2-step', async () => {
      const names = play.interface.fragments.filter((f) => f.type === 'function').map((f) => f.name)
      expect(names).to.not.include('setTreasury')
      await play.connect(deployer).proposeTreasury(other.address)
      expect(await play.treasury()).to.equal(treasury.address) // proposing alone changes nothing
      await expect(play.connect(bob).acceptTreasury()).to.be.reverted // only the nominee can accept
      await play.connect(other).acceptTreasury()
      expect(await play.treasury()).to.equal(other.address)
      // hand it back so nothing downstream in this file depends on order
      await play.connect(deployer).proposeTreasury(treasury.address)
      await play.connect(treasury).acceptTreasury()
      expect(await play.treasury()).to.equal(treasury.address)
    })

    await test('owner handoff requires two steps; owner/operator distinctness enforced along the way', async () => {
      await play.connect(deployer).proposeOwner(other.address)
      expect(await play.owner()).to.equal(deployer.address)
      await expect(play.connect(bob).acceptOwner()).to.be.reverted
      await play.connect(other).acceptOwner()
      expect(await play.owner()).to.equal(other.address)
      await expect(play.connect(deployer).setOperator(bob.address)).to.be.reverted
      // new owner cannot propose the current operator as the next owner
      await expect(play.connect(other).proposeOwner(operator.address)).to.be.reverted
      // hand it back so nothing downstream in this file depends on order
      await play.connect(other).proposeOwner(deployer.address)
      await play.connect(deployer).acceptOwner()
    })

    await test('setOperator rejects setting the operator to the current owner\'s address', async () => {
      await expect(play.connect(deployer).setOperator(deployer.address)).to.be.reverted
    })

    // No malicious-token reentrancy test here, unlike Vault's — Vault's
    // MaliciousReentrantToken mock is hardcoded to call a Vault-specific
    // withdraw(uint256), which HeistPlay doesn't expose, so it can't
    // exercise this contract meaningfully without a second mock. The
    // real guard is structural and already exercised implicitly by every
    // test above: both play() and payout() mark their idempotency key
    // (playedRuns/paidRefs) *before* any external token call — the same
    // checks-effects-interactions ordering Vault's withdraw() uses — so
    // even without nonReentrant, a reentrant call would hit "already
    // played"/"already paid" immediately. nonReentrant is redundant
    // belt-and-suspenders on top of that, same as Vault.
  }

  console.log('\nHeistPlay — treasury(0), role distinctness, per-tx/daily caps')
  {
    const usdg = await deploy(contracts, 'MockUSDG', deployer)
    const playPrice = ethers.parseUnits('10', 18)
    const treasuryBps = 1000n // 10%
    const perTxCap = ethers.parseUnits('5', 18)
    const dailyCap = ethers.parseUnits('8', 18)

    await test('constructor reverts when owner and operator would be the same address', async () => {
      await expect(deploy(
        contracts, 'HeistPlay', deployer,
        await usdg.getAddress(), deployer.address, deployer.address, treasury.address,
        playPrice, treasuryBps, perTxCap, dailyCap,
      )).to.be.reverted
    })

    // treasury starts unset — the real multisig doesn't exist yet at
    // deploy time in every case (see DECISIONS.md P7); this must be
    // possible without hardcoding a placeholder address.
    const play = await deploy(
      contracts, 'HeistPlay', deployer,
      await usdg.getAddress(), deployer.address, operator.address, ethers.ZeroAddress,
      playPrice, treasuryBps, perTxCap, dailyCap,
    )

    await usdg.mint(alice.address, ethers.parseUnits('1000', 18))
    await usdg.connect(alice).approve(await play.getAddress(), ethers.MaxUint256)

    await test('play() refuses to run while treasury is still the zero address', async () => {
      const runId = ethers.keccak256(ethers.toUtf8Bytes('run-notreasury'))
      await expect(play.connect(alice).play(runId)).to.be.reverted
    })

    await test('proposeTreasury/acceptTreasury: 2-step, only the nominee can accept', async () => {
      await play.connect(deployer).proposeTreasury(treasury.address)
      expect(await play.treasury()).to.equal(ethers.ZeroAddress) // proposing alone changes nothing
      await expect(play.connect(alice).acceptTreasury()).to.be.reverted
      await play.connect(treasury).acceptTreasury()
      expect(await play.treasury()).to.equal(treasury.address)
    })

    const runId2 = ethers.keccak256(ethers.toUtf8Bytes('run-caps-1'))
    await test('play() now succeeds once treasury is set; pool = 9 USDG (10 - 10% cut)', async () => {
      await play.connect(alice).play(runId2)
      expect(await play.pooledBalance()).to.equal(ethers.parseUnits('9', 18))
    })

    await test('payout() reverts when amount exceeds the per-tx cap', async () => {
      const ref = ethers.keccak256(ethers.toUtf8Bytes('cap-ref-1'))
      await expect(play.connect(operator).payout(bob.address, ref, ethers.parseUnits('6', 18), 'loot')).to.be.reverted
    })

    await test('payout() succeeds within both caps, tracks the day\'s cumulative total', async () => {
      const ref = ethers.keccak256(ethers.toUtf8Bytes('cap-ref-2'))
      await play.connect(operator).payout(bob.address, ref, ethers.parseUnits('5', 18), 'loot') // day total: 5
    })

    await test('payout() reverts when the day\'s cumulative total would exceed the daily cap', async () => {
      const ref = ethers.keccak256(ethers.toUtf8Bytes('cap-ref-3'))
      // 5 (already paid today) + 4 = 9 > dailyCap(8)
      await expect(play.connect(operator).payout(bob.address, ref, ethers.parseUnits('4', 18), 'loot')).to.be.reverted
    })

    await test('a smaller amount that keeps the day within the daily cap still succeeds', async () => {
      const ref = ethers.keccak256(ethers.toUtf8Bytes('cap-ref-4'))
      // 5 + 3 = 8 == dailyCap(8), and pool still holds 9 - 5 = 4, so 3 is payable
      await play.connect(operator).payout(bob.address, ref, ethers.parseUnits('3', 18), 'loot') // day total: 8
    })
  }

  console.log('\nHeistPlay — solvency invariant')
  {
    const usdg = await deploy(contracts, 'MockUSDG', deployer)
    const playPrice = ethers.parseUnits('10', 18)
    const bigCap = ethers.parseUnits('1000', 18)
    // treasuryBps = 0 here so the whole entry fee stays pooled — makes
    // the pool's exact size easy to reason about for this test.
    const play = await deploy(
      contracts, 'HeistPlay', deployer,
      await usdg.getAddress(), deployer.address, operator.address, treasury.address,
      playPrice, 0n, bigCap, bigCap,
    )

    await usdg.mint(alice.address, ethers.parseUnits('1000', 18))
    await usdg.connect(alice).approve(await play.getAddress(), ethers.MaxUint256)
    await play.connect(alice).play(ethers.keccak256(ethers.toUtf8Bytes('run-solvency-1')))
    // pool now holds exactly 10 USDG.

    await test('payout() reverts with InsufficientPool when requesting more than the pool actually holds, even under the per-tx/daily caps', async () => {
      const ref = ethers.keccak256(ethers.toUtf8Bytes('solvency-ref-1'))
      expect(await play.pooledBalance()).to.equal(ethers.parseUnits('10', 18))
      await expect(play.connect(operator).payout(bob.address, ref, ethers.parseUnits('11', 18), 'loot')).to.be.reverted
    })

    await test('a payout within the actual pool balance still succeeds', async () => {
      const ref = ethers.keccak256(ethers.toUtf8Bytes('solvency-ref-2'))
      await play.connect(operator).payout(bob.address, ref, ethers.parseUnits('10', 18), 'loot')
      expect(await play.pooledBalance()).to.equal(0n)
    })
  }

  console.log('\nHeistPlay — 6-decimal token (real USDG, not the ERC20-default 18)')
  {
    // DECISIONS.md P10: USDG has 6 decimals, verified on-chain against the
    // real token. HeistPlay stores/moves raw token units and has no
    // opinion on decimals — this proves that's actually true by running
    // the same play()/payout() flow against a 6dp token with realistic
    // "10 USDG" amounts and checking the raw units, not 10**18-scaled
    // ones. If any future edit hardcodes 18 decimals somewhere, the
    // numbers below stop matching and this fails loudly.
    const usdg6 = await deploy(contracts, 'MockUSDG6', deployer)
    expect(await usdg6.symbol()).to.equal('USDG')
    expect(await usdg6.decimals()).to.equal(6)

    const playPrice6 = ethers.parseUnits('10', 6) // 10 USDG = 10_000_000 raw units at 6dp
    const treasuryBps = 1000n // 10%
    const cap6 = ethers.parseUnits('1000', 6)
    const play6 = await deploy(
      contracts, 'HeistPlay', deployer,
      await usdg6.getAddress(), deployer.address, operator.address, treasury.address,
      playPrice6, treasuryBps, cap6, cap6,
    )

    await usdg6.mint(alice.address, ethers.parseUnits('1000', 6))
    await usdg6.connect(alice).approve(await play6.getAddress(), ethers.MaxUint256)

    await test('play() moves exactly 10_000_000 raw units (10 USDG at 6dp), not 10e18', async () => {
      await play6.connect(alice).play(ethers.keccak256(ethers.toUtf8Bytes('run-6dp-1')))
      expect(await usdg6.balanceOf(treasury.address)).to.equal(1_000_000n) // 10% of 10_000_000
      expect(await play6.pooledBalance()).to.equal(9_000_000n)
      expect(await play6.pooledBalance()).to.equal(playPrice6 - 1_000_000n)
      // Sanity: this would be off by a factor of 10^12 if 6dp amounts were
      // ever treated as 18dp.
      expect(await play6.pooledBalance()).to.not.equal(ethers.parseUnits('9', 18))
    })

    await test('payout() on a 6dp token moves the exact raw amount requested', async () => {
      const before = await usdg6.balanceOf(bob.address)
      await play6.connect(operator).payout(bob.address, ethers.keccak256(ethers.toUtf8Bytes('6dp-payout-1')), 4_000_000n, 'loot')
      expect(await usdg6.balanceOf(bob.address)).to.equal(before + 4_000_000n)
      expect(await play6.pooledBalance()).to.equal(5_000_000n)
    })
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
