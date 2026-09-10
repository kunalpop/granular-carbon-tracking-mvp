// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title OntologyRegistry
/// @notice On-chain, semantically versioned registry of the event schema
///         (DP11; the extension hook for DP6 multi-resource modularity).
///         Every emission event names a schemaVersion; this contract is the
///         authority on what those versions mean: each version carries the
///         hash of its full off-chain schema document, so "version 1.2.0"
///         can never be quietly redefined after the fact.
contract OntologyRegistry is AccessControl {
    bytes32 public constant ONTOLOGY_ADMIN_ROLE = keccak256("ONTOLOGY_ADMIN_ROLE");

    struct SchemaVersion {
        string version;      // semantic version string, e.g. "1.2.0"
        bytes32 schemaHash;  // keccak256 of the schema document
        string uri;          // where the document lives off-chain
        uint64 registeredAt;
        bool deprecated;
    }

    mapping(string => SchemaVersion) private _byVersion;
    mapping(string => bool) private _known;
    string[] private _versionList;
    string public currentVersion;

    event SchemaRegistered(string version, bytes32 schemaHash, string uri);
    event SchemaDeprecated(string version);
    event CurrentVersionChanged(string oldVersion, string newVersion);

    error VersionAlreadyRegistered(string version);
    error UnknownVersion(string version);
    error EmptyVersion();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ONTOLOGY_ADMIN_ROLE, admin);
    }

    /// @notice Register a new schema version and make it current.
    function registerSchema(
        string calldata version,
        bytes32 schemaHash,
        string calldata uri
    ) external onlyRole(ONTOLOGY_ADMIN_ROLE) {
        if (bytes(version).length == 0) revert EmptyVersion();
        if (_known[version]) revert VersionAlreadyRegistered(version);
        _known[version] = true;
        _byVersion[version] = SchemaVersion(version, schemaHash, uri, uint64(block.timestamp), false);
        _versionList.push(version);

        string memory old = currentVersion;
        currentVersion = version;
        emit SchemaRegistered(version, schemaHash, uri);
        emit CurrentVersionChanged(old, version);
    }

    /// @notice Deprecate a version. It stays on record (history is never
    ///         erased) but new events should not use it.
    function deprecateSchema(string calldata version) external onlyRole(ONTOLOGY_ADMIN_ROLE) {
        if (!_known[version]) revert UnknownVersion(version);
        _byVersion[version].deprecated = true;
        emit SchemaDeprecated(version);
    }

    function isKnownVersion(string calldata version) external view returns (bool) {
        return _known[version];
    }

    function isActiveVersion(string calldata version) external view returns (bool) {
        return _known[version] && !_byVersion[version].deprecated;
    }

    function getSchema(string calldata version) external view returns (SchemaVersion memory) {
        if (!_known[version]) revert UnknownVersion(version);
        return _byVersion[version];
    }

    function versionCount() external view returns (uint256) {
        return _versionList.length;
    }

    function versionAt(uint256 index) external view returns (string memory) {
        return _versionList[index];
    }
}
