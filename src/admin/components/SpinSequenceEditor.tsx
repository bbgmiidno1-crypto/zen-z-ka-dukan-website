import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight, Box, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import type { Product360FrameCount, Product360Sequence } from '@shared/types';

export interface SpinExistingItem {
  kind: 'existing';
  id: number;
  path: string;
  thumbPath: string;
}

export interface SpinFileItem {
  kind: 'file';
  key: string;
  file: File;
  previewUrl: string;
}

export type SpinItem = SpinExistingItem | SpinFileItem;

export interface SpinDraft {
  frameCount: Product360FrameCount;
  items: SpinItem[];
  modelFile: File | null;
  existingModelPath: string | null;
  removeModel: boolean;
  clearSequence: boolean;
}

export const SPIN_FRAME_COUNTS: Product360FrameCount[] = [8, 12, 16, 24, 36];
const SPIN_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MODEL_TYPES = ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream'];
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function createSpinDraft(sequence?: Product360Sequence | null): SpinDraft {
  return {
    frameCount: sequence?.frameCount ?? 8,
    items: (sequence?.images ?? []).map((image) => ({
      kind: 'existing' as const,
      id: image.id,
      path: image.path,
      thumbPath: image.thumbPath,
    })),
    modelFile: null,
    existingModelPath: sequence?.modelPath ?? null,
    removeModel: false,
    clearSequence: false,
  };
}

interface SpinSequenceEditorProps {
  draft: SpinDraft;
  variantName: string;
  onChange: (draft: SpinDraft) => void;
}

export function SpinSequenceEditor({ draft, variantName, onChange }: SpinSequenceEditorProps) {
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  const [localError, setLocalError] = useState('');

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current = [];
  }, []);

  function makeFileItem(file: File): SpinFileItem {
    const previewUrl = URL.createObjectURL(file);
    objectUrls.current.push(previewUrl);
    return { kind: 'file', key: uid(), file, previewUrl };
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>, replace: boolean) {
    const incoming = Array.from(event.target.files || []);
    event.target.value = '';
    if (!incoming.length) return;
    const valid = incoming.filter((file) => SPIN_TYPES.includes(file.type) && file.size <= 12 * 1024 * 1024);
    if (valid.length !== incoming.length) {
      setLocalError('Some files were skipped. Use JPEG, PNG, WebP or AVIF angle photographs under 12 MB.');
    } else {
      setLocalError('');
    }
    const base = replace ? [] : [...draft.items];
    const combined = [...base, ...valid.slice(0, Math.max(0, 36 - base.length)).map(makeFileItem)];
    if (base.length + valid.length > 36) setLocalError('A sequence can contain at most 36 angle images.');
    onChange({ ...draft, items: combined, clearSequence: false });
  }

  function handleModel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    const name = file.name.toLowerCase();
    const validType = MODEL_TYPES.includes(file.type) || name.endsWith('.glb') || name.endsWith('.gltf');
    if (!validType || file.size > 20 * 1024 * 1024) {
      setLocalError('Choose a GLB or glTF model under 20 MB.');
      return;
    }
    setLocalError('');
    onChange({ ...draft, modelFile: file, removeModel: false });
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.items.length) return;
    const items = [...draft.items];
    [items[index], items[target]] = [items[target], items[index]];
    onChange({ ...draft, items, clearSequence: false });
  }

  function removeItem(index: number) {
    const items = draft.items.filter((_, position) => position !== index);
    onChange({ ...draft, items, clearSequence: items.length === 0 });
  }

  function removeAll() {
    onChange({ ...draft, items: [], modelFile: null, existingModelPath: null, removeModel: true, clearSequence: true });
  }

  function removeModel() {
    onChange({ ...draft, modelFile: null, existingModelPath: null, removeModel: true });
  }

  const count = draft.items.length;
  const partial = count > 0 && count !== draft.frameCount;
  const exact = count === draft.frameCount;
  const modelName = draft.modelFile?.name || (draft.existingModelPath ? draft.existingModelPath.split('/').pop() : '');

  return (
    <div className="spin-editor">
      <div className="spin-editor-head">
        <div>
          <div className="eyebrow">{variantName || 'Colour variant'} · separate 360° sequence</div>
          <div className="spin-count">{count} / {draft.frameCount} angles {exact ? '· ready' : ''}</div>
        </div>
        <label className="field-label" style={{ minWidth: 150 }}>
          Angles per rotation
          <select
            className="select"
            value={draft.frameCount}
            onChange={(event) => onChange({ ...draft, frameCount: Number(event.target.value) as Product360FrameCount })}
            aria-label={`${variantName || 'Colour'} 360 angle count`}
          >
            {SPIN_FRAME_COUNTS.map((value) => <option value={value} key={value}>{value} angles</option>)}
          </select>
        </label>
      </div>

      <div className="spin-actions">
        <button className="btn btn-outline btn-small" type="button" onClick={() => addInputRef.current?.click()}>
          <Upload size={14} /> Add angle photos
        </button>
        <button className="btn btn-outline btn-small" type="button" onClick={() => replaceInputRef.current?.click()}>
          <RefreshCw size={14} /> Replace all angles
        </button>
        <button className="btn btn-outline btn-small" type="button" onClick={() => modelInputRef.current?.click()}>
          <Box size={14} /> {modelName ? 'Replace 3D model' : 'Optional GLB / glTF'}
        </button>
        <button className="btn btn-outline btn-small" type="button" onClick={removeAll} disabled={count === 0 && !modelName}>
          <Trash2 size={14} /> Remove all
        </button>
      </div>

      <input ref={addInputRef} className="spin-file-hidden" type="file" multiple accept={SPIN_TYPES.join(',')} onChange={(event) => handleFiles(event, false)} aria-label={`Add 360 angles for ${variantName}`} />
      <input ref={replaceInputRef} className="spin-file-hidden" type="file" multiple accept={SPIN_TYPES.join(',')} onChange={(event) => handleFiles(event, true)} aria-label={`Replace 360 angles for ${variantName}`} />
      <input ref={modelInputRef} className="spin-file-hidden" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={handleModel} aria-label={`Upload 3D model for ${variantName}`} />

      {count > 0 && (
        <div className="spin-preview-grid">
          {draft.items.map((item, index) => (
            <div className="spin-frame" key={item.kind === 'existing' ? `existing-${item.id}` : item.key}>
              <img src={item.kind === 'existing' ? item.thumbPath : item.previewUrl} alt={`360 angle ${index + 1} preview`} loading="lazy" />
              <span className="spin-frame-index">{index + 1}{item.kind === 'file' ? ' · new' : ''}</span>
              <div className="spin-frame-actions">
                <button type="button" onClick={() => moveItem(index, -1)} disabled={index === 0} aria-label={`Move angle ${index + 1} earlier`}><ArrowLeft size={13} /></button>
                <button type="button" onClick={() => moveItem(index, 1)} disabled={index === count - 1} aria-label={`Move angle ${index + 1} later`}><ArrowRight size={13} /></button>
                <button type="button" onClick={() => removeItem(index)} aria-label={`Remove angle ${index + 1}`}><X size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modelName && (
        <div className="spin-model-row">
          <Box size={15} className="gold-text" />
          <span>3D model: <strong>{modelName}</strong></span>
          <button className="icon-btn" style={{ width: 32, height: 32 }} type="button" onClick={removeModel} aria-label="Remove 3D model"><X size={13} /></button>
        </div>
      )}

      {partial && (
        <div className="form-error spin-info" role="alert">
          Exactly {draft.frameCount} angle images are required for this colour. {count < draft.frameCount ? `${draft.frameCount - count} more image${draft.frameCount - count === 1 ? '' : 's'} must be added.` : `${count - draft.frameCount} image${count - draft.frameCount === 1 ? '' : 's'} must be removed, or choose a matching angle count.`}
        </div>
      )}
      {count === 0 && (
        <div className="notice spin-info">
          Normal product photos can still be saved without 360° images. The 360° VIEW button will show an explanatory state until exactly {draft.frameCount} ordered, photographed angles are uploaded for this colour.
        </div>
      )}
      {exact && <div className="notice spin-info">This exact {draft.frameCount}-angle sequence will be saved with this colour variant and available after refresh or server restart.</div>}
      {localError && <div className="form-error spin-info" role="alert">{localError}</div>}
    </div>
  );
}
