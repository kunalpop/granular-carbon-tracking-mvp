// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title ConsortiumMultisig
/// @notice Minimal K-of-N multi-signature executor. The consortium owners
///         (configured from participant accounts at deployment) must jointly
///         confirm an action — such as
///         upgrading the GovernanceModule — before it can execute. This is
///         the on-chain form of the "regulatory override under joint
///         control" requirement of DP4: override is possible, but never
///         unilateral and never unlogged.
contract ConsortiumMultisig {
    struct Transaction {
        address target;
        bytes data;
        bool executed;
        uint256 voteCount;
        uint8 status;
        address eventOwner;
    }

    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public immutable required;

    Transaction[] private _transactions;
    mapping(uint256 => mapping(address => uint8)) public voteStatus;
    address public immutable deployerOwner;
    address public immutable auditorOwner;

    event TransactionSubmitted(uint256 indexed txId, address indexed by, address target);
    event TransactionVoted(uint256 indexed txId, address indexed by, uint8 decision, uint256 voteCount);
    event TransactionExecuted(uint256 indexed txId, address indexed by);

    error NotAnOwner(address account);
    error InvalidSetup();
    error UnknownTransaction(uint256 txId);
    error AlreadyVoted(uint256 txId, address owner);
    error AlreadyExecuted(uint256 txId);
    error NotEnoughConfirmations(uint256 txId, uint256 have, uint256 need);
    error ExecutionFailed(uint256 txId);

    modifier onlyOwner() {
        if (!isOwner[msg.sender]) revert NotAnOwner(msg.sender);
        _;
    }

    constructor(address[] memory _owners, uint256 _required) {
        if (_owners.length == 0 || _required == 0 || _required > _owners.length) revert InvalidSetup();
        for (uint256 i = 0; i < _owners.length; i++) {
            if (_owners[i] == address(0) || isOwner[_owners[i]]) revert InvalidSetup();
            isOwner[_owners[i]] = true;
            owners.push(_owners[i]);
        }
        required = _required;
        deployerOwner = _owners[0];
        auditorOwner = _owners[1];
    }

    function submit(address target, bytes calldata data) external onlyOwner returns (uint256 txId) {
        _transactions.push(Transaction(target, data, false, 0, 0, address(0)));
        txId = _transactions.length - 1;
        emit TransactionSubmitted(txId, msg.sender, target);
    }

    function submit(address target, bytes calldata data, address eventOwner) external onlyOwner returns (uint256 txId) {
        if (!isOwner[eventOwner]) revert NotAnOwner(eventOwner);
        _transactions.push(Transaction(target, data, false, 0, 0, eventOwner));
        txId = _transactions.length - 1;
        emit TransactionSubmitted(txId, msg.sender, target);
    }

    function vote(uint256 txId, uint8 decision) public onlyOwner {
        if (txId >= _transactions.length) revert UnknownTransaction(txId);
        Transaction storage t = _transactions[txId];
        if (t.eventOwner != address(0) && msg.sender != deployerOwner && msg.sender != auditorOwner && msg.sender != t.eventOwner) revert NotAnOwner(msg.sender);
        if (t.executed) revert AlreadyExecuted(txId);
        if (decision != 1 && decision != 2) revert InvalidSetup();
        if (voteStatus[txId][msg.sender] != 0) revert AlreadyVoted(txId, msg.sender);
        voteStatus[txId][msg.sender] = decision;
        t.voteCount += 1;
        uint256 approvals = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            if (voteStatus[txId][owners[i]] == 1) approvals++;
        }
        if (t.voteCount == owners.length && approvals >= required) t.status = 1;
        else if (t.voteCount == owners.length && approvals < required) t.status = 2;
        emit TransactionVoted(txId, msg.sender, decision, t.voteCount);
    }

    function confirm(uint256 txId) external onlyOwner { vote(txId, 1); }
    function reject(uint256 txId) external onlyOwner { vote(txId, 2); }

    function execute(uint256 txId) external onlyOwner {
        if (txId >= _transactions.length) revert UnknownTransaction(txId);
        Transaction storage t = _transactions[txId];
        if (t.executed) revert AlreadyExecuted(txId);
        if (t.status != 1) revert NotEnoughConfirmations(txId, t.voteCount, required);
        t.executed = true;
        (bool ok, ) = t.target.call(t.data);
        if (!ok) revert ExecutionFailed(txId);
        emit TransactionExecuted(txId, msg.sender);
    }

    function transactionCount() external view returns (uint256) {
        return _transactions.length;
    }

    function transactionAt(uint256 txId) external view returns (Transaction memory) {
        if (txId >= _transactions.length) revert UnknownTransaction(txId);
        return _transactions[txId];
    }

    function ownerCount() external view returns (uint256) {
        return owners.length;
    }
}
