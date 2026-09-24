import { EMISSION_FACTORS } from "../../services/emissionFactors";
import { ACTOR_NAMES } from "../../services/getParticipants";
import { getSigner } from "../../services/getSigner";
import { getParticipantRegistryContract } from "../../hooks/useContracts";

const PARTICIPANT_REGISTRY_ABI = [
  "function isRegistered(address account) view returns (bool)",
  "function canWriteStage(address account, uint8 stageId) view returns (bool)",
  "function registerParticipant(address account, string name, string organisationRole)",
  "function authoriseStage(address account, uint8 stageId)",
];

const ADMIN = "deployer";

type ParticipantRegistration = {
  name: string;
  role: string;
  address: string;
  stages: string;
};

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

export async function registerActors(actors: ParticipantRegistration[]) {
  // Admin signer for write transactions
  const adminSigner = getSigner(ADMIN);

  // ParticipantRegistry contract instance with admin signer
  const participants = getParticipantRegistryContract(
    PARTICIPANT_REGISTRY_ABI,
    adminSigner,
  );

  // Register each actor and authorise their stages if not already done
  for (const actor of actors) {
    const { name, role, address: addr } = actor;
    if (!(await participants.isRegistered(addr))) {
      await (await participants.registerParticipant(addr, name, role)).wait();
      console.log(`  registered ${role.padEnd(14)} ${name}`);
    }
    const stageIds = actor.stages.split(",").map((value) => Number(value.trim())).filter((stageId) => Number.isInteger(stageId) && stageId > 0);
    for (const stageId of stageIds) {
      if (!(await participants.canWriteStage(addr, stageId))) {
        await (await participants.authoriseStage(addr, stageId)).wait();
        console.log(`  authorised ${role.padEnd(14)} for stage ${stageId}`);
      }
    }
  }
}
