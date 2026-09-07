// Compiles contracts/*.sol directly with the `solc` npm package (fetched
// from the npm registry, which this environment can reach) instead of
// Hardhat's own compile task (which downloads the solc binary from
// binaries.soliditylang.org — blocked by this environment's egress
// allowlist, see DECISIONS.md P10). Run standalone (`node scripts/compile.js`)
// or required by the test scripts, which call `--no-compile` when invoking
// `hardhat run` so Hardhat never attempts its own download.
const fs = require('fs')
const path = require('path')
const solc = require('solc')

const CONTRACTS_DIR = path.join(__dirname, '..', 'contracts')
const NODE_MODULES = path.join(__dirname, '..', 'node_modules')

function findSources(dir, base = CONTRACTS_DIR) {
  const out = {}
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) Object.assign(out, findSources(full, base))
    else if (entry.name.endsWith('.sol')) {
      const rel = 'contracts/' + path.relative(base, full).split(path.sep).join('/')
      out[rel] = { content: fs.readFileSync(full, 'utf8') }
    }
  }
  return out
}

function findImport(importPath) {
  // Resolve "@openzeppelin/..." and "../X.sol"-style relative imports
  // (already relative to contracts/) against node_modules / contracts/.
  const candidates = importPath.startsWith('.')
    ? [path.join(CONTRACTS_DIR, importPath)]
    : [path.join(NODE_MODULES, importPath)]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { contents: fs.readFileSync(candidate, 'utf8') }
  }
  return { error: `File not found: ${importPath}` }
}

function compile() {
  const sources = findSources(CONTRACTS_DIR)
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  }

  // solc resolves relative imports (e.g. "../Vault.sol" from a mocks/ file)
  // against the importing file's own directory, not the project root — so
  // findImport needs the same base-relative resolution solc itself would
  // do. The simple approach here (rooted at CONTRACTS_DIR) works because
  // this repo's imports are shallow (one level of ../), which is all we
  // have.
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }))

  const errors = (output.errors || []).filter((e) => e.severity === 'error')
  if (errors.length) {
    for (const e of output.errors) console.error(e.formattedMessage || e.message)
    throw new Error(`solc reported ${errors.length} error(s)`)
  }
  if (output.errors) {
    for (const e of output.errors) console.warn(e.formattedMessage || e.message)
  }

  const contracts = {}
  for (const [file, byName] of Object.entries(output.contracts)) {
    for (const [name, c] of Object.entries(byName)) {
      contracts[name] = {
        abi: c.abi,
        bytecode: '0x' + c.evm.bytecode.object,
        deployedBytecode: '0x' + c.evm.deployedBytecode.object,
        sourceFile: file,
      }
    }
  }
  return contracts
}

module.exports = { compile }

if (require.main === module) {
  const contracts = compile()
  console.log('Compiled:', Object.keys(contracts).join(', '))
}
