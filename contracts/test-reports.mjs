// Local test for RivalScopeReports: node contracts/test-reports.mjs contracts/RivalScopeReports.sol assets/config.js
// Needs (on NODE_PATH or next to this file): npm i solc@0.8.24 ganache@7.9.2 ethers@6.13.4
import fs from "node:fs";
import solc from "solc";
import ganache from "ganache";
import { ethers } from "ethers";

const src = fs.readFileSync(process.argv[2], "utf8");
const cfg = fs.readFileSync(process.argv[3], "utf8");
const ABI = eval("[" + cfg.split("export const ABI = [")[1].split("];")[0] + "]"); // the front-end ABI
const out = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "R.sol": { content: src } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
})));
(out.errors || []).forEach((e) => console.log(e.severity, e.formattedMessage.split("\n")[0]));
if ((out.errors || []).some((e) => e.severity === "error")) process.exit(1);
const art = out.contracts["R.sol"].RivalScopeReports;

const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true }, chain: { hardfork: "shanghai" } }));
const [a, b] = await Promise.all([provider.getSigner(0), provider.getSigner(1)]);
const dep = await new ethers.ContractFactory(art.abi, art.evm.bytecode.object, a).deploy();
await dep.waitForDeployment();
const c = new ethers.Contract(await dep.getAddress(), ABI, a);
const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };
const expectRevert = async (p, name, msg) => {
  try { await p; ok(false, msg); } catch (e) {
    const n = e.revert?.name || (e.data && c.interface.parseError(e.data)?.name) || e.shortMessage;
    ok(String(n).includes(name), `${msg} (${n})`);
  }
};

let s = await c.stats();
ok(s[0] === 0n && s[1] === 0n && s[2] === 0n, "stats start at 0");
await expectRevert(c.getReport(0n), "NotFound", "id 0 is NotFound");

const rc = await (await c.stamp(h("r1"), "brewly.cafe, beanbox.co", 2, 0)).wait();
const ev = rc.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "Stamped");
ok(ev && ev.args.id === 1n && Number(ev.args.sites) === 2 && ev.args.owner === (await a.getAddress()), "first report gets id 1 and emits Stamped");

const r = await c.getReport(1n);
ok(r.owner === (await a.getAddress()) && r.reportHash === h("r1") && r.domains === "brewly.cafe, beanbox.co" && Number(r.sites) === 2 && r.previous === 0n && r[5] > 0n, "getReport returns the full struct");

await (await c.stamp(h("r2"), "brewly.cafe, beanbox.co, cuppa.club", 3, 1)).wait();
await (await c.stamp(h("r3"), "brewly.cafe, beanbox.co, cuppa.club", 3, 2)).wait();
ok((await c.history(3n)).map(Number).join() === "3,2,1", "history follows previous links newest first");
ok((await c.history(1n)).map(Number).join() === "1", "history of a first report is itself");
ok((await c.reportsOfOwner(await a.getAddress())).map(Number).join() === "1,2,3", "reportsOfOwner");

await expectRevert(c.connect(b).stamp.staticCall(h("x"), "a.com, b.com", 2, 1), "BadPrevious", "cannot link someone else's report");
await expectRevert(c.stamp.staticCall(h("x"), "a.com, b.com", 2, 99), "BadPrevious", "cannot link a missing report");
await expectRevert(c.stamp.staticCall(ethers.ZeroHash, "a.com, b.com", 2, 0), "EmptyHash", "zero hash rejected");
await expectRevert(c.stamp.staticCall(h("x"), "", 2, 0), "BadDomains", "empty domains rejected");
await expectRevert(c.stamp.staticCall(h("x"), "x".repeat(161), 2, 0), "BadDomains", "domains > 160 bytes rejected");
ok((await c.stamp.staticCall(h("x"), "x".repeat(160), 4, 0)) === 4n, "domains of exactly 160 bytes and 4 sites accepted");
await expectRevert(c.stamp.staticCall(h("x"), "a.com", 1, 0), "BadSites", "1 site rejected");
await expectRevert(c.stamp.staticCall(h("x"), "a.com", 5, 0), "BadSites", "5 sites rejected");

await (await c.connect(b).stamp(h("b1"), "cuppa.club, brewly.cafe, beanbox.co, x.com", 4, 0)).wait();
s = await c.stats();
ok(s[0] === 4n && s[1] === 12n && s[2] === 2n, "stats counts reports, sites and unique wallets");
await expectRevert(c.getReport(5n), "NotFound", "getReport past the end NotFound");
await expectRevert(c.history(5n), "NotFound", "history past the end NotFound");
console.log("bytecode bytes:", art.evm.bytecode.object.length / 2);
