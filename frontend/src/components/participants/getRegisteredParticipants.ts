import { EMISSION_FACTORS } from "../../services/emissionFactors";
import { ACTOR_NAMES } from "../../services/getParticipants";
import { getSigner } from "../../services/getSigner";
import { getParticipantRegistryContract } from "../../hooks/useContracts";

const PARTICIPANT_REGISTRY_ABI = [
  "function isRegistered(address account) view returns (bool)",
  "function getParticipant(address account) view returns (tuple(string name, string organisationRole, bool active, uint64 registeredAt))",
  "function canWriteStage(address account, uint8 stageId) view returns (bool)",
];

const ADMIN = "deployer";

function getStageRoles() {
  const rolesNeedingStages = new Map<string, number[]>();
  for (const stage of EMISSION_FACTORS.stages) {
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
  const rolesNeedingStages = getStageRoles();
  const roles = Object.keys(ACTOR_NAMES);
  const actorAccounts = roles.map((role) => ({
    role,
    address: getSigner(role as Parameters<typeof getSigner>[0]).address,
    stageIds: rolesNeedingStages.get(role) ?? [],
  }));

  // These reads are independent, so batch them instead of waiting for each
  // participant and stage authorization request sequentially.
  const registrationStates = await Promise.all(
    actorAccounts.map(({ address }) => participants.isRegistered(address)),
  );
  if (registrationStates.some((registered) => !registered)) return undefined;

  const rows = await Promise.all(
    actorAccounts.map(async ({ address, stageIds }, index) => {
      const [record, stageAuthorizations] = await Promise.all([
        participants.getParticipant(address),
        Promise.all(
          stageIds.map((stageId) => participants.canWriteStage(address, stageId)),
        ),
      ]);

      if (stageAuthorizations.some((authorized) => !authorized)) return undefined;

      return {
        id: index + 1,
        name: String(record.name),
        role: String(record.organisationRole),
        address,
        stages: stageIds.join(","),
      };
    }),
  );

  if (rows.some((row) => row === undefined)) return undefined;
  return rows as Array<{ id: number; name: string; role: string; address: string; stages: string }>;
}
