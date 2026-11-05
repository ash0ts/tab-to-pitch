"""Read-only Toraneko 2.7 project imports. Missing media remains unresolved."""
from __future__ import annotations
import json
from .store import digest

TORANEKO_REVISION = '7258c72d22bbe6b3e68875384afcbec43d3849d1'

def inspect_project(raw: bytes):
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError('project-size-limit')
    doc = json.loads(raw)
    if not isinstance(doc, dict) or str(doc.get('schema_version', doc.get('version', ''))) != '2.7.0':
        raise ValueError('unsupported-project-version')
    source_notes = doc.get('source_notes', [])
    if not isinstance(source_notes, list) or len(source_notes) > 100000:
        raise ValueError('invalid-source-notes')
    # Retain the original bytes and references. Do not follow filenames or paths.
    references = {k:doc.get(k) for k in ('source_asset_hash','playback_asset_hash','transcription_id')}
    return {'schemaVersion':'ear-lab-v1','sourceFormat':'toraneko-project-2.7.0',
            'sourceRevision':TORANEKO_REVISION,'sourceSha256':digest(raw),
            'sourceNoteCount':len(source_notes),'referenceAuthority':'unestablished',
            'unresolvedReferences':references,'sourceUnchanged':True,
            'limitations':['Imported metadata does not establish recording truth.',
                           'Relink media by content hash; no filesystem paths are followed.',
                           'Practice tracks remain in the preserved export until explicitly recreated.']}
