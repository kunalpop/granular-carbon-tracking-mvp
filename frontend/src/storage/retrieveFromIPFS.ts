// Downloads encrypted document bytes from the backend Pinata endpoint.
export async function retrieveFromIPFS(documentId: string): Promise<Blob> {
  /*
   * Perform the retrieveFromIPFS operation and handle its input, output, or errors.
   */
  /* Validate the ID, request the encrypted bytes, and return them as a Blob. */
  if (!documentId.trim()) throw new Error("Document ID is required.");
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/file`);
  if (!response.ok) throw new Error(`Unable to retrieve document ${documentId}: ${response.status} ${response.statusText}`);
  return response.blob();
}
