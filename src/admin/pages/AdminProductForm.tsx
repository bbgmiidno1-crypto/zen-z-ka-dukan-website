import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Box, Palette, Plus, Ruler, Save, Trash2, Upload } from 'lucide-react';
import type { AdminProductDetail, Category, Product360FormPayload, ProductFormPayload, ProductImage } from '@shared/types';
import { AdminPageHeader } from '@/admin/AdminUI';
import { SpinSequenceEditor, createSpinDraft, type SpinDraft, type SpinExistingItem, type SpinFileItem } from '@/admin/components/SpinSequenceEditor';
import { EmptyState, LoadingBlock } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/lib/api';

interface SizeRow {
  key: string;
  id?: number;
  label: string;
}

interface VariantRow {
  key: string;
  id?: number;
  name: string;
  colorHex: string;
  existingImages: ProductImage[];
  files: File[];
  stock: number[];
  spin: SpinDraft;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const newSize = (label = ''): SizeRow => ({ key: uid(), label });
const newVariant = (sizeCount: number): VariantRow => ({
  key: uid(),
  name: '',
  colorHex: '#111111',
  existingImages: [],
  files: [],
  stock: Array.from({ length: sizeCount }, () => 0),
  spin: createSpinDraft(),
});

function serializeSpinDraft(draft: SpinDraft): Product360FormPayload {
  return {
    frameCount: draft.frameCount,
    existingImages: draft.items
      .filter((item): item is SpinExistingItem => item.kind === 'existing')
      .map((item) => ({ id: item.id, path: item.path, thumbPath: item.thumbPath })),
    existingModelPath: draft.existingModelPath,
    removeModel: draft.removeModel,
    clearSequence: draft.clearSequence,
  };
}

export default function AdminProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [available, setAvailable] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [newArrival, setNewArrival] = useState(true);
  const [bestSeller, setBestSeller] = useState(false);
  const [sizes, setSizes] = useState<SizeRow[]>([newSize('One Size')]);
  const [variants, setVariants] = useState<VariantRow[]>([newVariant(1)]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const categoryResponse = await api.get<{ categories: Category[] }>('/api/admin/categories');
        if (!active) return;
        setCategories(categoryResponse.categories);
        if (id) {
          const response = await api.get<{ product: AdminProductDetail }>(`/api/admin/products/${id}`);
          if (!active) return;
          const product = response.product;
          setName(product.name);
          setSlug(product.slug);
          setDescription(product.description);
          setCategoryId(product.categoryId ? String(product.categoryId) : '');
          setPrice(String(product.pricePaise / 100));
          setOriginalPrice(String(product.originalPricePaise / 100));
          setAvailable(product.available);
          setFeatured(product.featured);
          setNewArrival(product.newArrival);
          setBestSeller(product.bestSeller);
          const loadedSizes = product.sizes.length
            ? product.sizes.map((size) => ({ key: uid(), id: size.id, label: size.label }))
            : [newSize('One Size')];
          setSizes(loadedSizes);
          setVariants(product.variants.length
            ? product.variants.map((variant) => ({
              key: uid(),
              id: variant.id,
              name: variant.name,
              colorHex: variant.colorHex,
              existingImages: variant.images,
              files: [],
              stock: loadedSizes.map((_, index) => variant.stock[index] ?? 0),
              spin: createSpinDraft(variant.spin),
            }))
            : [newVariant(loadedSizes.length)]);
        }
      } catch (err) {
        if (active) setError(errorMessage(err, 'Unable to load the product editor.'));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [id]);

  function updateSize(index: number, label: string) {
    setSizes((current) => current.map((size, position) => position === index ? { ...size, label } : size));
  }

  function addSize() {
    setSizes((current) => [...current, newSize()]);
    setVariants((current) => current.map((variant) => ({ ...variant, stock: [...variant.stock, 0] })));
  }

  function removeSize(index: number) {
    if (sizes.length <= 1) return;
    setSizes((current) => current.filter((_, position) => position !== index));
    setVariants((current) => current.map((variant) => ({ ...variant, stock: variant.stock.filter((_, position) => position !== index) })));
  }

  function updateVariant(index: number, patch: Partial<VariantRow>) {
    setVariants((current) => current.map((variant, position) => position === index ? { ...variant, ...patch } : variant));
  }

  function addVariant() {
    setVariants((current) => [...current, newVariant(sizes.length)]);
  }

  function removeVariant(index: number) {
    if (variants.length <= 1) return;
    setVariants((current) => current.filter((_, position) => position !== index));
  }

  function chooseFiles(index: number, event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files || []);
    const valid = incoming.filter((file) => ALLOWED_TYPES.includes(file.type) && file.size <= 6 * 1024 * 1024);
    if (valid.length !== incoming.length) showToast('Some files were skipped. Use JPEG, PNG, WebP or AVIF images under 6 MB.', 'error');
    const variant = variants[index];
    const capacity = Math.max(0, 8 - variant.existingImages.length);
    const accepted = valid.slice(0, capacity);
    if (valid.length > capacity) showToast('A colour variant can have at most 8 images.', 'error');
    updateVariant(index, { files: accepted });
    event.target.value = '';
  }

  function removeExistingImage(variantIndex: number, imageId: number) {
    const variant = variants[variantIndex];
    updateVariant(variantIndex, { existingImages: variant.existingImages.filter((image) => image.id !== imageId) });
  }

  function updateStock(variantIndex: number, sizeIndex: number, value: string) {
    const variant = variants[variantIndex];
    const stock = [...variant.stock];
    stock[sizeIndex] = Math.max(0, Number(value) || 0);
    updateVariant(variantIndex, { stock });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const pricePaise = Math.round(Number(price) * 100);
    const originalPricePaise = Math.round(Number(originalPrice) * 100);
    if (!Number.isFinite(pricePaise) || pricePaise <= 0 || !Number.isFinite(originalPricePaise) || originalPricePaise < pricePaise) {
      showToast('Enter a valid selling price and an original price at least as high.', 'error');
      return;
    }
    if (sizes.some((size) => !size.label.trim())) {
      showToast('Give every size a label.', 'error');
      return;
    }
    if (variants.some((variant) => !variant.name.trim() || variant.existingImages.length + variant.files.length === 0)) {
      showToast('Every colour variant needs a name and at least one uploaded image.', 'error');
      return;
    }
    setBusy(true);
    try {
      const payload: ProductFormPayload = {
        ...(id ? { id: Number(id) } : {}),
        name,
        slug: slug.trim() || undefined,
        description,
        categoryId: categoryId ? Number(categoryId) : null,
        pricePaise,
        originalPricePaise,
        available,
        featured,
        newArrival,
        bestSeller,
        sizes: sizes.map((size) => ({ id: size.id, label: size.label.trim() })),
        variants: variants.map((variant) => ({
          id: variant.id,
          name: variant.name.trim(),
          colorHex: variant.colorHex,
          existingImages: variant.existingImages.map((image) => ({ id: image.id, path: image.path, thumbPath: image.thumbPath })),
          stock: sizes.map((_, index) => Math.max(0, Number(variant.stock[index]) || 0)),
          spin: serializeSpinDraft(variant.spin),
        })),
      };
      const data = new FormData();
      data.append('payload', JSON.stringify(payload));
      variants.forEach((variant, index) => {
        variant.files.forEach((file) => data.append(`variantImages_${index}`, file));
        variant.spin.items
          .filter((item): item is SpinFileItem => item.kind === 'file')
          .forEach((item) => data.append(`spinImages_${index}`, item.file));
        if (variant.spin.modelFile) data.append(`spinModels_${index}`, variant.spin.modelFile);
      });
      const response = await api.upload<{ warnings?: string[] }>(isEdit ? `/api/admin/products/${id}` : '/api/admin/products', data, isEdit ? 'PUT' : 'POST');
      showToast(isEdit ? 'Product updated with persistent images and stock.' : 'Product created with persistent images and stock.', 'success');
      if (response.warnings?.length) showToast(response.warnings[0], 'info');
      navigate('/admin/products');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock label="Opening product editor…" />;
  if (error) {
    return (
      <div>
        <AdminPageHeader eyebrow="Product management" title="Product editor" />
        <EmptyState title="Editor unavailable" description={error} action={<Link className="btn btn-gold" to="/admin/products">Back to products</Link>} />
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Product management"
        title={isEdit ? 'Edit product' : 'Add product'}
        description="All images are uploaded directly from your device, optimized to WebP and stored in the persistent upload volume."
        action={<Link className="btn btn-outline btn-small" to="/admin/products"><ArrowLeft size={14} /> Back to products</Link>}
      />

      <form className="grid gap-6" onSubmit={submit}>
        <section className="panel panel-pad">
          <div className="eyebrow">01 · Product identity</div>
          <div className="admin-form-grid" style={{ marginTop: 20 }}>
            <label><span className="field-label">Product name</span><input className="input" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} /></label>
            <label><span className="field-label">Slug (optional)</span><input className="input" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="Auto-generated from name" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label>
            <label className="span-2"><span className="field-label">Description</span><textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} required minLength={10} maxLength={3000} /></label>
            <label>
              <span className="field-label">Category</span>
              <select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Uncategorized</option>
                {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="field-label">Selling price (₹)</span><input className="input" type="number" min="1" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
              <label><span className="field-label">Original price (₹)</span><input className="input" type="number" min="1" step="0.01" value={originalPrice} onChange={(event) => setOriginalPrice(event.target.value)} required /></label>
            </div>
            <div className="span-2 admin-toggle-grid">
              <label className="admin-toggle">Available <input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} /></label>
              <label className="admin-toggle">Featured product <input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /></label>
              <label className="admin-toggle">New arrival <input type="checkbox" checked={newArrival} onChange={(event) => setNewArrival(event.target.checked)} /></label>
              <label className="admin-toggle">Best seller <input type="checkbox" checked={bestSeller} onChange={(event) => setBestSeller(event.target.checked)} /></label>
            </div>
            <div className="notice span-2">Discount percentage is calculated securely from the selling and original prices on the server.</div>
          </div>
        </section>

        <section className="panel panel-pad">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2"><Ruler size={17} className="gold-text" /><div><div className="eyebrow">02 · Sizes</div><h3 className="luxe-title" style={{ fontSize: '1.7rem', marginTop: 4 }}>Available sizes</h3></div></div>
            <button className="btn btn-outline btn-small" type="button" onClick={addSize}><Plus size={14} /> Add size</button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3" style={{ marginTop: 20 }}>
            {sizes.map((size, index) => (
              <div className="flex gap-2" key={size.key}>
                <input className="input" value={size.label} onChange={(event) => updateSize(index, event.target.value)} placeholder={`Size ${index + 1}`} aria-label={`Size ${index + 1} label`} required />
                <button className="icon-btn" type="button" onClick={() => removeSize(index)} disabled={sizes.length <= 1} aria-label={`Remove size ${index + 1}`}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel-pad">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2"><Palette size={17} className="gold-text" /><div><div className="eyebrow">03 · Colour variants</div><h3 className="luxe-title" style={{ fontSize: '1.7rem', marginTop: 4 }}>Separate images per colour</h3></div></div>
            <button className="btn btn-outline btn-small" type="button" onClick={addVariant}><Plus size={14} /> Add colour</button>
          </div>
          <div className="grid gap-4" style={{ marginTop: 20 }}>
            {variants.map((variant, index) => (
              <div className="variant-editor" key={variant.key}>
                <div className="variant-header">
                  <div className="eyebrow">Colour {index + 1}</div>
                  <button className="icon-btn" style={{ width: 36, height: 36 }} type="button" onClick={() => removeVariant(index)} disabled={variants.length <= 1} aria-label={`Remove colour ${index + 1}`}><Trash2 size={15} /></button>
                </div>
                <div className="admin-form-grid">
                  <label><span className="field-label">Colour name</span><input className="input" value={variant.name} onChange={(event) => updateVariant(index, { name: event.target.value })} placeholder="e.g. Champagne Gold" required /></label>
                  <label><span className="field-label">Swatch</span><input className="input" type="color" value={variant.colorHex} onChange={(event) => updateVariant(index, { colorHex: event.target.value })} style={{ padding: 4, height: 48 }} aria-label={`Colour ${index + 1} hex`} /></label>
                  <label className="span-2">
                    <span className="field-label">Upload images for this colour</span>
                    <div className="upload-drop">
                      <Upload size={18} className="gold-text" style={{ margin: '0 auto 8px' }} />
                      {variant.files.length ? `${variant.files.length} new image(s) selected` : 'Choose one or more images from your device'}
                      <input type="file" multiple accept={ALLOWED_TYPES.join(',')} onChange={(event) => chooseFiles(index, event)} />
                    </div>
                  </label>
                  {variant.files.length > 0 && <div className="span-2 muted" style={{ fontSize: '.7rem' }}>{variant.files.map((file) => file.name).join(' · ')}</div>}
                </div>
                {variant.existingImages.length > 0 && (
                  <div className="existing-images">
                    {variant.existingImages.map((image) => (
                      <div className="existing-image" key={image.id}>
                        <img src={image.thumbPath} alt="Stored variant image" loading="lazy" />
                        <button type="button" onClick={() => removeExistingImage(index, image.id)} aria-label="Remove stored image"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>


        <section className="panel panel-pad">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2"><Box size={17} className="gold-text" /><div><div className="eyebrow">04 · Interactive product media</div><h3 className="luxe-title" style={{ fontSize: '1.7rem', marginTop: 4 }}>360° PRODUCT IMAGES</h3></div></div>
            <span className="spin-count">Separate sequence per colour</span>
          </div>
          <div className="notice" style={{ marginTop: 16 }}>
            Upload ordered front, side and rear photographs for each colour variant. Exactly 8, 12, 16, 24 or 36 angles enable a real image-sequence 360° view. Choose files from Android phone storage or a desktop folder, preview them, drag their order with the arrow controls, remove or replace any angle, and save. A GLB/glTF model is optional; the image sequence works without it. Normal product uploads remain valid when no 360° images are provided.
          </div>
          <div className="grid gap-4" style={{ marginTop: 20 }}>
            {variants.map((variant, index) => (
              <div className="variant-editor" key={`spin-${variant.key}`}>
                <div className="variant-header"><div className="eyebrow">Colour {index + 1} · {variant.name || 'Unnamed colour'}</div></div>
                <SpinSequenceEditor
                  draft={variant.spin}
                  variantName={variant.name || `Colour ${index + 1}`}
                  onChange={(spin) => updateVariant(index, { spin })}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel-pad">
          <div className="eyebrow">05 · Stock matrix</div>
          <h3 className="luxe-title" style={{ fontSize: '1.7rem', marginTop: 6 }}>Manage sizes and stock</h3>
          <div className="stock-matrix">
            <table>
              <thead><tr><th>Colour / Size</th>{sizes.map((size, index) => <th key={size.key}>{size.label || `Size ${index + 1}`}</th>)}</tr></thead>
              <tbody>
                {variants.map((variant, variantIndex) => (
                  <tr key={variant.key}>
                    <td><span style={{ display: 'inline-block', width: 12, height: 12, background: variant.colorHex, marginRight: 8, border: '1px solid rgba(255,255,255,.2)' }} />{variant.name || `Colour ${variantIndex + 1}`}</td>
                    {sizes.map((size, sizeIndex) => (
                      <td key={`${variant.key}-${size.key}`}>
                        <input className="input" type="number" min="0" max="9999" value={variant.stock[sizeIndex] ?? 0} onChange={(event) => updateStock(variantIndex, sizeIndex, event.target.value)} aria-label={`Stock for ${variant.name || 'colour'} in ${size.label || 'size'}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <button className="btn btn-gold" type="submit" disabled={busy}><Save size={15} /> {busy ? 'Saving…' : isEdit ? 'Update product' : 'Create product'}</button>
          <Link className="btn btn-outline" to="/admin/products">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
