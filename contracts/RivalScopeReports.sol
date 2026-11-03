// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RivalScope Reports
/// @notice Stamps a fingerprint of a competitor-research report on BOT Chain.
///         Only the hash, the domains, the site count and a link to an earlier report are stored —
///         the report itself stays with its owner. No tokens, payments or admin.
contract RivalScopeReports {
    struct Report {
        address owner;
        bytes32 reportHash; // keccak256 of the canonical report JSON
        string domains;     // "you.com, rival1.com, …" (≤ 160 bytes)
        uint8 sites;        // 2–4
        uint256 previous;   // 0 or an earlier report id of the same owner
        uint64 at;          // block timestamp
    }

    uint8 public constant MIN_SITES = 2;
    uint8 public constant MAX_SITES = 4;
    uint256 public constant MAX_DOMAINS_BYTES = 160;
    uint256 public constant MAX_HISTORY = 64;

    /// @dev Index 0 is an empty placeholder so real ids start at 1 and `previous = 0` means "none".
    Report[] public reports;
    mapping(address => uint256[]) internal reportsOf;
    uint256 public totalSites;
    uint256 public owners;

    event Stamped(uint256 indexed id, address indexed owner, uint8 sites);

    error EmptyHash();
    error BadDomains();
    error BadSites();
    error BadPrevious();
    error NotFound();

    constructor() {
        reports.push();
    }

    function stamp(bytes32 reportHash, string calldata domains, uint8 sites, uint256 previous)
        external
        returns (uint256 id)
    {
        if (reportHash == bytes32(0)) revert EmptyHash();
        uint256 len = bytes(domains).length;
        if (len == 0 || len > MAX_DOMAINS_BYTES) revert BadDomains();
        if (sites < MIN_SITES || sites > MAX_SITES) revert BadSites();
        if (previous != 0 && (previous >= reports.length || reports[previous].owner != msg.sender)) revert BadPrevious();

        id = reports.length;
        reports.push(Report(msg.sender, reportHash, domains, sites, previous, uint64(block.timestamp)));
        if (reportsOf[msg.sender].length == 0) owners++;
        reportsOf[msg.sender].push(id);
        totalSites += sites;
        emit Stamped(id, msg.sender, sites);
    }

    function getReport(uint256 id) external view returns (Report memory) {
        if (id == 0 || id >= reports.length) revert NotFound();
        return reports[id];
    }

    function reportsOfOwner(address owner) external view returns (uint256[] memory) {
        return reportsOf[owner];
    }

    /// @notice The chain of reports ending at `id`, newest first (follows `previous` links, max 64).
    function history(uint256 id) external view returns (uint256[] memory ids) {
        if (id == 0 || id >= reports.length) revert NotFound();
        uint256 n;
        uint256 cur = id;
        while (cur != 0 && n < MAX_HISTORY) { n++; cur = reports[cur].previous; }
        ids = new uint256[](n);
        cur = id;
        for (uint256 i; i < n; i++) { ids[i] = cur; cur = reports[cur].previous; }
    }

    /// @return reportCount stamped reports · sites total sites analysed · wallets unique stampers
    function stats() external view returns (uint256 reportCount, uint256 sites, uint256 wallets) {
        return (reports.length - 1, totalSites, owners);
    }
}
