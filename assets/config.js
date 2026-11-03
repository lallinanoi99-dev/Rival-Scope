// ===== RivalScope config — the only place to change addresses and endpoints =====
export const CONFIG = {
  // "mainnet" for the live site, "testnet" while testing
  NETWORK: "mainnet",

  // Paste the deployed RivalScopeReports address here. Zero address = "not deployed yet" mode
  // (analysis and PDF export still work; stamping is disabled).
  MAINNET_CONTRACT_ADDRESS: "0x910CF2Aea22a90Ddb5BB0b0CDEAa71eceE2fF2CF",
  TESTNET_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",

  // Cloudflare Worker with /extract-url (the page reader). All analysis runs in the browser.
  // Leave empty and only the demo sites and pasted text can be read.
  // On localhost the app uses a Worker started with `npm --prefix worker run dev` (port 8790).
  WORKER_URL: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "http://127.0.0.1:8790" : "",

  // Fictional demo sites (folder /demo in this repo) used by "See an example".
  DEMO_SITES: ["/demo/brewly/", "/demo/beanbox/", "/demo/cuppa-club/"],

  GITHUB_URL: "https://github.com/",
  X_URL: "https://x.com/BOTChain_ai",
  BOTCHAIN_URL: "https://botchain.ai",

  NETWORKS: {
    mainnet: {
      chainId: 677,
      chainName: "BOT Chain",
      rpc: "https://rpc.botchain.ai",
      explorer: "https://scan.botchain.ai",
      currency: { name: "BOT", symbol: "BOT", decimals: 18 },
    },
    testnet: {
      chainId: 968,
      chainName: "BOT Chain Testnet",
      rpc: "https://rpc.bohr.life",
      explorer: "https://scan.bohr.life",
      currency: { name: "BOT", symbol: "BOT", decimals: 18 },
    },
  },
};

// Where the site lives: "/" on a custom domain, "/Rival-Scope/" on GitHub Pages. Worked out from this file's URL.
export const BASE = new URL("../", import.meta.url).pathname;
/** Root-style app path ("/app/report/x") → real URL path under BASE. */
export const at = (p) => BASE + String(p).replace(/^\//, "");

export const NET = CONFIG.NETWORKS[CONFIG.NETWORK];
export const CONTRACT = CONFIG.NETWORK === "mainnet" ? CONFIG.MAINNET_CONTRACT_ADDRESS : CONFIG.TESTNET_CONTRACT_ADDRESS;
export const IS_DEPLOYED = !/^0x0{40}$/i.test(CONTRACT);

export const ABI = [
  "function stamp(bytes32 reportHash, string domains, uint8 sites, uint256 previous) returns (uint256 id)",
  "function getReport(uint256 id) view returns (tuple(address owner, bytes32 reportHash, string domains, uint8 sites, uint256 previous, uint64 at))",
  "function reportsOfOwner(address owner) view returns (uint256[])",
  "function history(uint256 id) view returns (uint256[] ids)",
  "function stats() view returns (uint256 reportCount, uint256 sites, uint256 wallets)",
  "event Stamped(uint256 indexed id, address indexed owner, uint8 sites)",
  "error EmptyHash()",
  "error BadDomains()",
  "error BadSites()",
  "error BadPrevious()",
  "error NotFound()",
];
