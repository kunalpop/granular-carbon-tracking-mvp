import { getSigner } from "../../services/getSigner";
import { getParticipantRegistryContract } from "../../hooks/useContracts";

const PARTICIPANT_REGISTRY_ABI = [
  "function isRegistered(address account) view returns (bool)",
  "function getParticipant(address account) view returns (tuple(string name, string organisationRole, bool active, uint64 registeredAt))",
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


export async function areParticipantsRegistered(): Promise<boolean> {
  const participants = getParticipantRegistryContract(
    PARTICIPANT_REGISTRY_ABI,
    getSigner(ADMIN),
  );
  return Boolean(await participants.isRegistered(getSigner("oem").address));
}

export async function registerParticipants(actors: ParticipantRegistration[]) {
  // Admin signer for write transactions
  const adminSigner = getSigner(ADMIN);

  // ParticipantRegistry contract instance with admin signer
  const participants = getParticipantRegistryContract(
    PARTICIPANT_REGISTRY_ABI,
    adminSigner,
  );

  const registrationStates = await Promise.all(
    actors.map((actor) => participants.isRegistered(actor.address)),
  );
  const registrationJobs = actors.flatMap((actor, index) => {
    if (registrationStates[index]) return [];
    return [async (nonce: number) => {
      const tx = await participants.registerParticipant(
        actor.address,
        actor.name,
        actor.role,
        { nonce, gasLimit: 400_000 },
      );
      console.log(`  registered ${actor.role.padEnd(14)} ${actor.name}`);
      return tx;
    }];
  });

  // The admin wallet is shared by every write. Explicit nonces allow all
  // independent transactions to be submitted without nonce races.
  let nonce = await adminSigner.getNonce("pending");
  const registrationTransactions = await Promise.all(
    registrationJobs.map((job) => job(nonce++)),
  );
  await Promise.all(registrationTransactions.map((tx) => tx.wait()));

  const stageChecks = await Promise.all(
    actors.flatMap((actor) => {
      const stageIds = actor.stages
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((stageId) => Number.isInteger(stageId) && stageId > 0);
      return stageIds.map(async (stageId) => ({
        actor,
        stageId,
        authorised: await participants.canWriteStage(actor.address, stageId),
      }));
    }),
  );
  const authorizationTransactions = await Promise.all(
    stageChecks
      .filter(({ authorised }) => !authorised)
      .map(async ({ actor, stageId }) => {
        const tx = await participants.authoriseStage(actor.address, stageId, {
          nonce: nonce++,
          gasLimit: 400_000,
        });
        console.log(`  authorised ${actor.role.padEnd(14)} for stage ${stageId}`);
        return tx;
      }),
  );
  await Promise.all(authorizationTransactions.map((tx) => tx.wait()));
}

// Backwards-compatible names used by the page components.
export const areActorsRegistered = areParticipantsRegistered;
export const registerActors = registerParticipants;
