// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {GovernanceModule} from "../GovernanceModule.sol";

/// @notice Test-support contract: a hypothetical next version of the
///         GovernanceModule, used only to prove that an upgrade (a)
///         preserves all state and (b) is executable exclusively through
///         the consortium multisig. Adds one function so tests can tell
///         the versions apart.
contract GovernanceModuleV2 is GovernanceModule {
    function version() external pure returns (string memory) {
        return "2.0.0";
    }
}
