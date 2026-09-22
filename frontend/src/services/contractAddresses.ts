import deployedContracts from "../../../simulation/deployed-addresses.json";

export interface ContractAddresses {
  participantRegistry: string;
  emissionEventRegistry: string;
  carbonToken: string;
  aggregationContract: string;
  ontologyRegistry: string;
  consortiumMultisig: string;
  governanceModule: string;
}

export const contractAddresses: ContractAddresses = {
  participantRegistry: deployedContracts.addresses.ParticipantRegistry,
  emissionEventRegistry: deployedContracts.addresses.EmissionEventRegistry,
  carbonToken: deployedContracts.addresses.CarbonToken,
  aggregationContract: deployedContracts.addresses.AggregationContract,
  ontologyRegistry: deployedContracts.addresses.OntologyRegistry,
  consortiumMultisig: deployedContracts.addresses.ConsortiumMultisig,
  governanceModule: deployedContracts.addresses.GovernanceModule,
};

export const CONTRACT_ADDRESSES = contractAddresses;
