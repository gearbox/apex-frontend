# Legal documents frontend contract

The canonical contract is maintained with the backend, not copied into this repository:

- Repository: `gearbox/apex`
- Commit: `dbeca2da7d3fa9e87169aa2d80656f2bdaf48cd7` (`feat/legal-documents`)
- Path: `docs/contracts/legal-documents-contract.md`

Regenerate `src/lib/api/schema.json` and `src/lib/api/types.ts` from that backend revision (or a
compatible later revision) before changing this feature. The backend contract is authoritative if
this frontend documentation and it disagree.

## Frontend notes

- **Public routes.** Each document type has its own public page: `/terms`, `/privacy` and
  `/consent` (`sensitive_data_consent`). `?version=` pins an immutable version. Build links with
  `legalDocumentHref()` in `src/lib/utils/routes.ts`, whose `Record<LegalDocType, string>` map makes
  a new document type a compile error. `/consent` is reached only through versioned "Read" links
  and is intentionally absent from navigation.
- **Re-acceptance display rule.** The blocker shows every document whose
  `accepted_version !== current_version` (unsatisfied documents are a subset), not only
  `satisfied === false`. The full current set is submitted, and the backend records an acceptance
  for each current version not yet accepted, so every such document must have been displayed and
  ticked. Documents already accepted at their current version stay hidden and are skipped
  idempotently.
