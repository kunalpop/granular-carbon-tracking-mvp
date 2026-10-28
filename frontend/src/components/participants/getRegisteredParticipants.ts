import { loadEmissionFactors, loadSupplierRoleMap } from "../../services/supplyChainIpfs";
import { getSigner } from "../../services/getSigner";
import { getParticipantRegistryContract } from "../../hooks/useContracts";

const PARTICIPANT_REGISTRY_ABI = [
  "function isRegistered(address account) view returns (bool)",
];

const ADMIN = "deployer";

async function getStageRoles() {
  const { stages } = await loadEmissionFactors();
  const rolesNeedingStages = new Map<string, number[]>();
  for (const stage of stages) {
    rolesNeedingStages.set(stage.actorRole, [
      ...(rolesNeedingStages.get(stage.actorRole) ?? []),
      stage.stageId,
    ]);
  }
  return rolesNeedingStages;
}

export async function loadRegisteredParticipants() {
  const participants = getParticipantRegistryContract(
    PARTICIPANT_REGISTRY_ABI,
    getSigner(ADMIN),
  );
  const rolesNeedingStages = await getStageRoles();
  const roleMap = await loadSupplierRoleMap();
  const actorAccounts = Object.entries(roleMap).map(([role, name]) => ({
    role,
    name,
    address: getSigner(role as Parameters<typeof getSigner>[0]).address,
    stageIds: rolesNeedingStages.get(role) ?? [],
  }));

  // These reads are independent, so batch them instead of waiting for each
  // participant and stage authorization request sequentially.
  const registrationStates = await Promise.all(
    actorAccounts.map(({ address }) => participants.isRegistered(address)),
  );
  if (registrationStates.some((registered) => !registered)) return undefined;

  const rows = actorAccounts.map(({ role, name, address, stageIds }, index) => ({
    id: index + 1,
    name,
    role,
    address,
    stages: stageIds.join(","),
  }));

  if (rows.some((row) => row === undefined)) return undefined;
  return rows as Array<{ id: number; name: string; role: string; address: string; stages: string }>;
}
