// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ParticipantRegistry
/// @notice Layer-1 identity for the consortium: which accounts exist, which
///         organisation they represent, and which lifecycle stages each may
///         write emission events for. Instantiates DP2 (distributed
///         verification) and FR2 (events bound to identified actors).
contract ParticipantRegistry is AccessControl {
    struct Participant {
        string name;             // human-readable, e.g. "Shenzhen PCB Co."
        string organisationRole; // e.g. "pcbSupplier"
        bool active;
        uint64 registeredAt;
    }

    uint8 public constant MIN_STAGE = 1;
    uint8 public constant MAX_STAGE = 10;

    mapping(address => Participant) private _participants;
    mapping(address => bool) private _known;
    mapping(address => mapping(uint8 => bool)) private _stageAuth;

    event ParticipantRegistered(address indexed account, string name, string organisationRole);
    event ParticipantDeactivated(address indexed account);
    event ParticipantReactivated(address indexed account);
    event StageAuthorised(address indexed account, uint8 indexed stageId);
    event StageRevoked(address indexed account, uint8 indexed stageId);

    error NotRegistered(address account);
    error AlreadyRegistered(address account);
    error InvalidStage(uint8 stageId);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function registerParticipant(
        address account,
        string calldata name,
        string calldata organisationRole
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_known[account]) revert AlreadyRegistered(account);
        _known[account] = true;
        _participants[account] = Participant(name, organisationRole, true, uint64(block.timestamp));
        emit ParticipantRegistered(account, name, organisationRole);
    }

    function deactivateParticipant(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_known[account]) revert NotRegistered(account);
        _participants[account].active = false;
        emit ParticipantDeactivated(account);
    }

    function reactivateParticipant(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_known[account]) revert NotRegistered(account);
        _participants[account].active = true;
        emit ParticipantReactivated(account);
    }

    function authoriseStage(address account, uint8 stageId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_known[account]) revert NotRegistered(account);
        if (stageId < MIN_STAGE || stageId > MAX_STAGE) revert InvalidStage(stageId);
        _stageAuth[account][stageId] = true;
        emit StageAuthorised(account, stageId);
    }

    function revokeStage(address account, uint8 stageId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_known[account]) revert NotRegistered(account);
        _stageAuth[account][stageId] = false;
        emit StageRevoked(account, stageId);
    }

    /// @notice Registered AND currently active.
    function isRegistered(address account) public view returns (bool) {
        return _known[account] && _participants[account].active;
    }

    /// @notice The write-gate consulted by the EmissionEventRegistry.
    function canWriteStage(address account, uint8 stageId) external view returns (bool) {
        return isRegistered(account) && _stageAuth[account][stageId];
    }

    function getParticipant(address account) external view returns (Participant memory) {
        if (!_known[account]) revert NotRegistered(account);
        return _participants[account];
    }
}
