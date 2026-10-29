# Frontend user guide

This guide walks through the frontend workflow, from starting the local app to
reviewing events and resolving issues. The app uses demo accounts and a Besu
blockchain running on your computer.

Role names are colour-coded: <span style="color: #765600;"><strong>Deployer</strong></span>,
<span style="color: #6842a6;"><strong>OEM</strong></span>,
<span style="color: #70405f;"><strong>Auditor</strong></span>, and
<span style="color: #176b5b;"><strong>lifecycle actors</strong></span>.
In the app, change roles with the **Account name** dropdown in the header.

## Start the App

From the repository folder, install the root packages and start the local
blockchain:

```text
npm install
npm run network:up
npm run network:health
npm run deploy:besu
```

Wait for the network health check to succeed. If these contracts are already
deployed to the running network, you can skip the deploy command. After a
network reset, deploy the contracts again.

In a second terminal, start the document service used to upload, retrieve, and decrypt
the Pinata/IPFS configuration files:

```text
cd backend
npm install
node server.js
```

Keep this service running on port `3001`. Set `PINATA_JWT` in the repository-root
`.env` before starting it; the service uses that credential to store encrypted
files on Pinata/IPFS and rejects uploads when it is missing or malformed.

Use the terminal where you ran the network commands. In a third terminal (or a
new VS Code terminal), start the browser app:

```text
cd frontend
npm install
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`. If the page does not
open, verify both terminal processes are still running and retry that URL. Keep
Docker, the network, the document service, and the Vite server running while you
use the app. Do not close the terminal windows used for the backend and frontend.
The network indicator at the top must show **Network online** before transactions
will succeed; if it shows offline, return to the terminal and run
`npm run network:health` again.

## Upload and Retrieve Documents

The browser encrypts supported files with AES-GCM before they leave the page.
The document service uploads the encrypted bytes to Pinata/IPFS, stores its
metadata in `backend/documents.json`, and creates an on-chain document proof
from the document ID, original hash, encrypted hash, participant ID, and CID.
PDF, CSV, text, image, and JSON files up to 25 MB are accepted; a maximum-size
1 MB check also applies to audit and escalation evidence.

- Supply-chain configuration is retrieved by its exact filename through
  `/api/documents/by-name/.../plain`. The newest uploaded
  `role-participant-map.json` and `emission-factors.json` supply the participant
  names and stage defaults shown by the app.
- Evidence selected for a correction, escalation, or event audit is encrypted
  and uploaded with product/event metadata. Related records can fetch the
  decrypted file by its original document hash from an **evidence** link.
- Configuration metadata and the latest plain JSON are cached in the browser.
  A direct fresh read and cache fallback are used when the service or a new
  Pinata upload is still becoming available.

Document encryption keys and records are local-demo data. In production, use a
protected document database and managed key service rather than
`backend/documents.json`.

## Register Participants

1. Choose the <span style="color: #6842a6;"><strong>OEM</strong></span> role from the **Account name** dropdown and open **Participants** in the sidebar. If participants have already been registered, the upload controls are intentionally hidden; start again from a fresh network deployment before uploading new configuration.
2. If the supplier map and emission-factor files are not present, choose **Upload Configuration Files**. Under **Supplier list**, choose the local `role-participant-map.json` file and press its **Upload** button. Under **Emission factors**, choose `emission-factors.json` and press its **Upload** button. Wait for both cards to show **Uploaded** and for the participant cards to be populated from the retrieved JSON.
3. Choose the <span style="color: #765600;"><strong>Deployer</strong></span> role from **Account name** and reopen **Participants**.
4. Check the **Stage** fields before registering. Set each lifecycle actor's
   stage IDs to match this list:

   | Lifecycle actor | Stage IDs |
   | --- | --- |
   | `smelter` | `1` |
   | `pcbSupplier` | `2` |
   | `batteryMaker` | `3` |
   | `screenSupplier` | `4` |
   | `oem` | `5,6` |
   | `logistics` | `7` |
   | `usePhaseAgent` | `8` |
   | `repairer` | `9` |
   | `recycler` | `10` |

   Enter multiple stage IDs separated by commas. The OEM appears on two stage
   cards; both fields refer to the same account.
5. Choose **Register Participants** and wait for the success message.

Review the form before submission because the uploaded configuration controls
participant names and stage rows. The <span style="color: #70405f;"><strong>Auditor</strong></span>
is a governance account and is not a lifecycle stage. The stage assignments
above are needed so the correct lifecycle actors can submit their events.

## Review and Mint Product

1. Choose the <span style="color: #765600;"><strong>Deployer</strong></span>
   role, open **Product**, enter or review the product description, and select
   **Send to OEM**.
2. Choose the <span style="color: #6842a6;"><strong>OEM</strong></span> role,
   return to **Product**, review the description, and select
   **Confirm to Deployer**.
3. Switch back to the
   <span style="color: #765600;"><strong>Deployer</strong></span> role and
   select **Mint Product**.
4. Confirm the new product appears in the Product dropdown in the header.
   Select it before continuing.

The review steps are saved in this browser until the product is created. The
product record and passport are written to the blockchain.

## Record Lifecycle Event

Record events in stage order. For each stage, choose its assigned
<span style="color: #176b5b;"><strong>lifecycle actor</strong></span> in the
header, open **Events**, review the activity and emission factor, and select
**Record Event**. The app unlocks later stages after earlier events have been
recorded.

| Stage | Work | Account to select |
| --- | --- | --- |
| 1 | Aluminium casing | `smelter` |
| 2 | Circuit board | `pcbSupplier` |
| 3 | Battery | `batteryMaker` |
| 4 | Screen | `screenSupplier` |
| 5 | Assembly | `oem` |
| 6 | Packaging | `oem` |
| 7 | International shipping | `logistics` |
| 8 | Use-phase electricity | `usePhaseAgent` |
| 9 | Repair / refurbishment | `repairer` |
| 10 | E-waste recycling | `recycler` |

The transaction records the event on chain and calculates its CO2e there.
Current activity and emission-factor values in the frontend configuration are
placeholders; do not treat the resulting totals as measured or evaluation-ready
data.

## Modify Emission Threshold

1. Choose the <span style="color: #765600;"><strong>Deployer</strong></span>
   role and open **Governance** → **Emission Thresholds**.
2. Find the lifecycle stage to update and choose **Edit**.
   If a value is already shown, it may be a suggested starting value from the
   demo data rather than a threshold saved on chain.
3. Enter the maximum CO2e for that stage in kilograms, then choose **Save**.
   The value must be zero or greater. Saving `0` disables the threshold for
   that stage.
4. Wait for the success message confirming that the threshold was saved on
   chain. The app converts the value from kilograms to grams before saving.

Thresholds are set separately for each stage. The Events page displays the
configured threshold alongside a recorded event; changing a threshold does
not change the event's emission value. The deployer can also upload
`thresholds.json` under Governance → Emission Thresholds as a named encrypted
configuration document. The configuration card displays the latest uploaded
filename and date; a later upload replaces the named document shown to the app.
Individual threshold edits remain the on-chain source of truth.

## Audit, Vote and Verify Correction

New events appear in the auditor's **Audit** → **Tasks** list for review. They
start as unaudited; the auditor must either discard the task or submit a
correction before the event is marked audited. The Audit page does not
automatically verify every event hash.

### Audit Events

1. Choose the <span style="color: #70405f;"><strong>Auditor</strong></span>
   role and open **Audit** → **Tasks**.
2. Review each event's details. If it needs no correction, choose **Discard**.
   This closes the task and marks the event audited on chain.
3. Use **History** to review correction proposals, voting outcomes, completed
   corrections, and any **evidence** links. Opening the link retrieves the
   encrypted file by its original hash, decrypts it on the document service,
   and displays it in the evidence viewer.

### Propose and Vote on a Correction

1. To correct an event, the
   <span style="color: #70405f;"><strong>Auditor</strong></span> edits its
   activity or emission factor, enters a reason, optionally selects an
   evidence document, and chooses **Submit** in **Audit** → **Tasks**. The
   original hash of the uploaded document is attached to the proposal and can
   be used to retrieve the decrypted evidence from the History view.
2. The proposal goes to the consortium multisig. It does not change the
   original event. The event's
   <span style="color: #176b5b;"><strong>lifecycle actor</strong></span>, the
   <span style="color: #765600;"><strong>Deployer</strong></span>, and the
   <span style="color: #70405f;"><strong>Auditor</strong></span> can vote, if
   those accounts are configured multisig owners.
3. Each eligible account selects its role, opens **Voting**, reviews the
   proposal, and chooses **Accept** or **Reject**. Each account can vote once.
   At least two approvals are required for the proposal to be accepted; voting
   can conclude as soon as that threshold is reached. A proposal is rejected
   once the remaining votes can no longer reach the threshold.
4. When accepted and executed, the corrected values appear for that event on
   the **Events** page. The original on-chain event remains unchanged; the
   correction is stored separately and used as the effective value for display.

Accounts that are not eligible owners can open **Voting**, but will not see
the proposal.

## Escalate and Resolve

### Raise an Escalation

1. Select the <span style="color: #70405f;"><strong>Auditor</strong></span>
   or the <span style="color: #176b5b;"><strong>lifecycle actor</strong></span>
   who recorded the event.
2. Open **Escalation** in the sidebar, enter the event index and a reason, optionally select
   supporting evidence, then submit. Evidence is encrypted, uploaded, and
   linked to the escalation's product and event metadata.

The page is visible to non-deployer accounts, but the blockchain accepts a
manual escalation only from the auditor or the actor who recorded that event.

### Resolve an Escalation

1. Select the <span style="color: #765600;"><strong>Deployer</strong></span>
   role and open **Governance**, then choose the **Escalation** tab.
2. Review the escalation, enter a resolution comment, and choose **Resolve**.

The app requires a comment before resolving. It saves the comment in this
browser; the on-chain record stores the resolution, not the comment.

When testing is complete, run `npm run lint` and `npm run build` from the
`frontend/` folder. After all three Results studies have completed, **Start New
Simulation** clears browser storage but leaves blockchain records intact.

---

[Frontend Page](../../README.md#frontend) · [Project Page](../../README.md)
