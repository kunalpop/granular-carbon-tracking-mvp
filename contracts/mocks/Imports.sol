// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Forces Hardhat to compile OpenZeppelin's ERC1967 proxy so tests can
// deploy the GovernanceModule behind it.
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
