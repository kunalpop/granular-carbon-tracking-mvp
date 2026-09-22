import { EMISSION_FACTORS } from "../../services/emissionFactors";
import { ACTOR_NAMES } from "../../services/getActors";
import { getSigner } from "../../services/getSigner";
import { getParticipantRegistryContract } from "../../hooks/useContracts";

const PARTICIPANT_REGISTRY_ABI = [
  "function isRegistered(address account) view returns (bool)",
  "function canWriteStage(address account, uint8 stageId) view returns (bool)",
  "function registerParticipant(address account, string name, string organisationRole)",
  "function authoriseStage(address account, uint8 stageId)",
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

export async function areActorsRegistered(): Promise<boolean> {
  const participants = getParticipantRegistryContract(
    PARTICIPANT_REGISTRY_ABI,
    getSigner(ADMIN),
  );
  const rolesNeedingStages = getStageRoles();

  for (const role of Object.keys(ACTOR_NAMES)) {
    const address = getSigner(role as Parameters<typeof getSigner>[0]).address;
    if (!(await participants.isRegistered(address))) return false;
    for (const stageId of rolesNeedingStages.get(role) ?? []) {
      if (!(await participants.canWriteStage(address, stageId))) return false;
    }
  }
  return true;
}

export async function registerActors() {
  // Admin signer for write transactions
  const adminSigner = getSigner(ADMIN);

  // ParticipantRegistry contract instance with admin signer
  const participants = getParticipantRegistryContract(
    PARTICIPANT_REGISTRY_ABI,
    adminSigner,
  );

  // Map each actor role to the stage IDs it is responsible for
  const rolesNeedingStages = getStageRoles();

  // Register each actor and authorise their stages if not already done
  for (const [role, name] of Object.entries(ACTOR_NAMES)) {
    const addr = getSigner(role).address;
    if (!(await participants.isRegistered(addr))) {
      await (await participants.registerParticipant(addr, name, role)).wait();
      console.log(`  registered ${role.padEnd(14)} ${name}`);
    }
    for (const stageId of rolesNeedingStages.get(role) ?? []) {
      if (!(await participants.canWriteStage(addr, stageId))) {
        await (await participants.authoriseStage(addr, stageId)).wait();
        console.log(`  authorised ${role.padEnd(14)} for stage ${stageId}`);
      }
    }
  }
}
