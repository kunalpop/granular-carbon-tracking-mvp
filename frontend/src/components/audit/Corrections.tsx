import { Interface } from "ethers";
import { useEffect, useState } from "react";
import Stage from "../../shared/Stage";
import {
  loadEmissionFactorsDirect,
  type EmissionFactorLibrary,
} from "../../services/supplyChainIpfs";
import { uploadDocument } from "../../storage/uploadDocument";
import { getSigner } from "../../services/getSigner";
import EvidenceModal from "../../shared/EvidenceModal";
import FileSelectCard from "../../shared/FileSelectCard";
import {
  eventRegistryForControl,
  governanceForControl,
  multisigForControl,
} from "../../services/controlContracts";
import { submitCorrection } from "./submitCorrection";

type ChainEvent = {
  index: number;
  stageId: number;
  activity: number;
  unit: string;
  emissionFactor: number;
  co2eKg: number;
  eventHash: string;
  thresholdKg: number;
  corrected: boolean;
  eventOwner: string;
  auditStatus: number;
};

const SELECTED_PRODUCT_KEY = "selected-product-id";
function productId() {
  const selected = window.localStorage.getItem(SELECTED_PRODUCT_KEY);
  return selected && selected !== "new" ? selected : "1";
}

export default function Corrections() {
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [drafts, setDrafts] = useState<
    Record<number, { activity: number; factor: number; reason: string }>
  >({});
  const [busy, setBusy] = useState<number | null>(null);
  const [discarding, setDiscarding] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<Set<number>>(new Set());
  const [discarded, setDiscarded] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [factors, setFactors] = useState<EmissionFactorLibrary>();
  const [evidenceFiles, setEvidenceFiles] = useState<
    Record<number, File | undefined>
  >({});
  const [evidenceLinks, setEvidenceLinks] = useState<
    Record<number, { url: string; name: string; type: string } | undefined>
  >({});
  const [viewingEvidence, setViewingEvidence] = useState<{
    url: string;
    name: string;
    type: string;
  }>();
  const [submittedReasons, setSubmittedReasons] = useState<
    Record<number, string>
  >({});

  useEffect(() => {
    void loadEmissionFactorsDirect()
      .then(setFactors)
      .catch(() => setFactors(undefined));
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const load = async () => {
    try {
      const id = productId();
      const registry = eventRegistryForControl();
      const governance = governanceForControl();
      const count = Number(await registry.eventCount(id));
      const discardedIndexes = new Set<number>();
      const next: ChainEvent[] = [];
      for (let index = 0; index < count; index++) {
        if (await governance.discardedCorrectionTask(id, index))
          discardedIndexes.add(index);
        const event = await registry.eventAt(id, index);
        const stage = factors?.stages.find(
          (item) => item.stageId === Number(event.stageId),
        );
        const configuredThresholdGrams = Number(
          await governance.stageThresholdGrams(event.stageId),
        );
        const thresholdConfigured = configuredThresholdGrams > 0;
        const threshold = thresholdConfigured
          ? configuredThresholdGrams / 1000
          : stage
          ? Math.abs(stage.activityValue * stage.emissionFactor_gCO2ePerUnit) /
            1000
          : 0;
        const activity = Number(event.activityData) / 1000;
        const factor = Number(event.emissionFactor) / 1000;
        const auditStatus = Number(await registry.auditStatus(id, index));
        next.push({
          index,
          stageId: Number(event.stageId),
          activity,
          unit: event.activityUnit,
          emissionFactor: factor,
          co2eKg: Number(event.co2eGrams) / 1000,
          eventHash: event.eventHash,
          thresholdKg: threshold,
          corrected: false,
          eventOwner: event.actor,
          auditStatus,
        });
        if (!stage) continue;
      }
      const submittedIndexes = new Set<number>();
      const loadedReasons: Record<number, string> = {};
      const loadedEvidenceHashes: Record<number, string> = {};
      const multisig = multisigForControl();
      const transactionCount = Number(await multisig.transactionCount());
      const ownerCount = Number(await multisig.ownerCount());
      const owners = await Promise.all(
        Array.from({ length: ownerCount }, (_, index) =>
          multisig.owners(index),
        ),
      );
      const requiredApprovals = Number(await multisig.required());
      const deployerOwner = (await multisig.deployerOwner()).toLowerCase();
      const auditorOwner = (await multisig.auditorOwner()).toLowerCase();
      const decoder = new Interface([
        "function correctEvent(uint256,uint256,uint256,int256,string,bytes32)",
      ]);
      for (
        let transactionId = 0;
        transactionId < transactionCount;
        transactionId++
      ) {
        const transaction = await multisig.transactionAt(transactionId);
        try {
          const args = decoder.decodeFunctionData(
            "correctEvent",
            transaction.data,
          );
          const eventOwner = String(transaction.eventOwner).toLowerCase();
          const eligibleOwners =
            eventOwner === "0x0000000000000000000000000000000000000000"
              ? owners
              : owners.filter((owner) => {
                  const normalizedOwner = owner.toLowerCase();
                  return (
                    normalizedOwner === deployerOwner ||
                    normalizedOwner === auditorOwner ||
                    normalizedOwner === eventOwner
                  );
                });
          const decisions = await Promise.all(
            eligibleOwners.map((owner) =>
              multisig.voteStatus(transactionId, owner),
            ),
          );
          const approvalCount = decisions.filter(
            (decision) => Number(decision) === 1,
          ).length;
          const votedCount = decisions.filter(
            (decision) => Number(decision) !== 0,
          ).length;
          const couldStillPass =
            approvalCount + eligibleOwners.length - votedCount >=
            requiredApprovals;
          const isPending =
            Number(transaction.status) === 0 &&
            !transaction.executed &&
            couldStillPass;
          if (isPending && String(args[0]) === String(id)) {
            const eventIndex = Number(args[1]);
            submittedIndexes.add(eventIndex);
            loadedReasons[eventIndex] = String(args[4]);
            loadedEvidenceHashes[eventIndex] = String(args[5]);
          }
        } catch {
          // Ignore non-correction multisig transactions.
        }
      }
      setSubmitted(submittedIndexes);
      setSubmittedReasons(loadedReasons);
      const evidenceResults = await Promise.all(
        Object.entries(loadedEvidenceHashes).map(async ([eventIndex, hash]) => {
          try {
            const response = await fetch(
              `/api/documents/by-original-hash/${encodeURIComponent(hash)}`,
            );
            if (!response.ok) return undefined;
            const document = (await response.json()) as {
              originalHash?: string;
              originalFileName?: string;
              originalFileType?: string;
            };
            if (
              String(document.originalHash).toLowerCase() !== hash.toLowerCase()
            )
              return undefined;
            return [
              Number(eventIndex),
              {
                url: `/api/documents/by-original-hash/${encodeURIComponent(
                  hash,
                )}/plain-file`,
                name: document.originalFileName ?? "evidence",
                type: document.originalFileType ?? "",
              },
            ] as const;
          } catch {
            return undefined;
          }
        }),
      );
      const loadedEvidenceLinks = Object.fromEntries(
        evidenceResults.filter(Boolean) as Array<
          readonly [number, { url: string; name: string; type: string }]
        >,
      );
      setEvidenceLinks(loadedEvidenceLinks);
      setDiscarded(discardedIndexes);
      setEvents(next);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load event chain.",
      );
    }
  };

  useEffect(() => {
    const refresh = () => void load();
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    window.addEventListener("product-selection-change", refresh);
    void load();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("product-selection-change", refresh);
    };
  }, [factors]);

  const correct = async (event: ChainEvent) => {
    const draft = drafts[event.index] ?? {
      activity: event.activity,
      factor: event.emissionFactor,
      reason: `Correction for Stage ${event.stageId}: `,
    };
    setBusy(event.index);
    setError("");
    setMessage("");
    try {
      const evidenceFile = evidenceFiles[event.index];
      if (evidenceFile && evidenceFile.size > 1024 * 1024) {
        throw new Error("Evidence file must not exceed 1 MB.");
      }
      const uploadedEvidence = evidenceFile
        ? await uploadDocument(evidenceFile, getSigner("auditor").address, {
            purpose: "correction-evidence",
            productId: productId(),
            eventIndex: event.index,
          })
        : undefined;
      await submitCorrection(
        productId(),
        String(event.index),
        draft.activity,
        draft.factor,
        draft.reason,
        event.eventOwner,
        uploadedEvidence?.originalHash,
      );
      setSubmitted((current) => new Set(current).add(event.index));
      setMessage(
        `Stage ${event.stageId} correction proposed to the consortium.`,
      );
      setSubmittedReasons((current) => ({
        ...current,
        [event.index]: draft.reason,
      }));
      setEvidenceFiles((current) => ({ ...current, [event.index]: undefined }));
      if (uploadedEvidence) {
        setEvidenceLinks((current) => ({
          ...current,
          [event.index]: {
            url: `/api/documents/${encodeURIComponent(
              uploadedEvidence.documentId,
            )}/plain-file`,
            name: uploadedEvidence.originalFileName,
            type: uploadedEvidence.originalFileType,
          },
        }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Correction failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel">
      {message && <p className="feedback success">{message}</p>}
      {error && <p className="feedback error">{error}</p>}
      {events.length === 0 && (
        <p>No recorded events are available for correction.</p>
      )}
      <div className="audit-corrections">
        {events
          .filter(
            (event) => !discarded.has(event.index) && event.auditStatus !== 2,
          )
          .map((event) => {
            const stage = factors?.stages.find(
              (item) => item.stageId === event.stageId,
            );
            if (!stage) return null;
            const draft = drafts[event.index] ?? {
              activity: event.activity,
              factor: event.emissionFactor,
              reason:
                submittedReasons[event.index] ??
                `Correction for Stage ${event.stageId}: `,
            };
            const breached =
              event.thresholdKg > 0 &&
              Math.abs(event.co2eKg) > event.thresholdKg;
            const initialReason = `Correction for Stage ${event.stageId}: `;
            const changed =
              draft.activity !== event.activity ||
              draft.factor !== event.emissionFactor ||
              draft.reason !== initialReason;
            return (
              <div className="correction-card" key={event.index}>
                <Stage
                  stageId={event.stageId}
                  title={stage.name}
                  owner={stage.actorRole}
                  activity={`${draft.activity} ${event.unit}`}
                  emissionFactor={`${draft.factor} gCO2e per ${event.unit}`}
                  emissionSchema={stage.methodology}
                  co2eKg={event.co2eKg}
                  correctedCo2eKg={(draft.activity * draft.factor) / 1000}
                  reportingStandard={stage.methodology}
                  previousEvent={
                    event.index > 0
                      ? `event-${events[event.index - 1]?.stageId}`
                      : null
                  }
                  eventIndex={event.index}
                  reason={draft.reason}
                  onReasonChange={(value) =>
                    setDrafts((current) => ({
                      ...current,
                      [event.index]: { ...draft, reason: value },
                    }))
                  }
                  editable={
                    busy !== event.index &&
                    !event.corrected &&
                    !submitted.has(event.index)
                  }
                  canRecord={!event.corrected && !submitted.has(event.index)}
                  recordDisabled={!changed}
                  actionLabel="Submit"
                  recording={busy === event.index}
                  discarding={discarding === event.index}
                  recorded={event.corrected}
                  pendingVote={submitted.has(event.index)}
                  thresholdBreached={breached}
                  thresholdKg={event.thresholdKg}
                  onActivityChange={(value) =>
                    setDrafts((current) => ({
                      ...current,
                      [event.index]: { ...draft, activity: Number(value) || 0 },
                    }))
                  }
                  onActivityBlur={() =>
                    setDrafts((current) => ({
                      ...current,
                      [event.index]: {
                        ...draft,
                        activity:
                          Number.isFinite(draft.activity) && draft.activity > 0
                            ? draft.activity
                            : event.activity,
                      },
                    }))
                  }
                  onEmissionFactorChange={(value) =>
                    setDrafts((current) => ({
                      ...current,
                      [event.index]: { ...draft, factor: Number(value) || 0 },
                    }))
                  }
                  onEmissionFactorBlur={() =>
                    setDrafts((current) => ({
                      ...current,
                      [event.index]: {
                        ...draft,
                        factor:
                          Number.isFinite(draft.factor) && draft.factor !== 0
                            ? draft.factor
                            : event.emissionFactor,
                      },
                    }))
                  }
                  onRecord={() => void correct(event)}
                  actionContent={
                    <FileSelectCard
                      className="evidence-upload-card"
                      title="Evidence file"
                      fileName={evidenceFiles[event.index]?.name}
                      emptyLabel="No file selected · max 1 MB"
                      disabled={
                        busy === event.index ||
                        discarding === event.index ||
                        submitted.has(event.index)
                      }
                      onFileChange={(file, input) => {
                        if (file && file.size > 1024 * 1024) {
                          setError("Evidence file must not exceed 1 MB.");
                          input.currentTarget.value = "";
                          return;
                        }
                        setError("");
                        setEvidenceFiles((current) => ({
                          ...current,
                          [event.index]: file,
                        }));
                      }}
                    />
                  }
                  evidence={
                    evidenceLinks[event.index]
                      ? (() => {
                          const link = evidenceLinks[event.index];
                          return link ? (
                            <button
                              type="button"
                              className="evidence-link"
                              onClick={() => {
                                setViewingEvidence(link);
                              }}
                            >
                              evidence
                            </button>
                          ) : null;
                        })()
                      : null
                  }
                  onDiscard={() => {
                    void (async () => {
                      setDiscarding(event.index);
                      setError("");
                      try {
                        const governance = governanceForControl();
                        const transaction =
                          await governance.discardCorrectionTask(
                            productId(),
                            event.index,
                          );
                        await transaction.wait();
                        setDiscarded((current) =>
                          new Set(current).add(event.index),
                        );
                        setEvidenceFiles((current) => ({
                          ...current,
                          [event.index]: undefined,
                        }));
                        setMessage(`Stage ${event.stageId} task discarded.`);
                      } catch (cause) {
                        setError(
                          cause instanceof Error
                            ? cause.message
                            : "Unable to discard task.",
                        );
                      } finally {
                        setDiscarding(null);
                      }
                    })();
                  }}
                />
              </div>
            );
          })}
      </div>
      {viewingEvidence && (
        <EvidenceModal
          url={viewingEvidence.url}
          onClose={() => setViewingEvidence(undefined)}
        />
      )}
    </section>
  );
}
