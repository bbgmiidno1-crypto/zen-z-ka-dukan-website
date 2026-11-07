import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import type { Category } from '@shared/types';
import { AdminAsyncState, AdminPageHeader } from '@/admin/AdminUI';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/lib/api';

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  specialFilter: '' | 'new_arrival' | 'best_seller';
  sortOrder: string;
}

const EMPTY_FORM: CategoryForm = { name: '', slug: '', description: '', specialFilter: '', sortOrder: '0' };
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export default function AdminCategories() {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ categories: Category[] }>('/api/admin/categories');
      setCategories(response.categories);
    } catch (err) {
      setError(errorMessage(err, 'Unable to load categories.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!imageFile) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function resetForm() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      specialFilter: category.specialFilter || '',
      sortOrder: String(category.sortOrder),
    });
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseFile(file: File | null) {
    if (!file) {
      setImageFile(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type) || file.size > 6 * 1024 * 1024) {
      showToast('Choose a JPEG, PNG, WebP or AVIF image under 6 MB.', 'error');
      return;
    }
    setImageFile(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug.trim() || undefined,
        description: form.description,
        imagePath: editing?.imagePath || undefined,
        specialFilter: form.specialFilter || null,
        sortOrder: Number(form.sortOrder || 0),
      };
      const data = new FormData();
      data.append('payload', JSON.stringify(payload));
      if (imageFile) data.append('image', imageFile);
      const endpoint = editing ? `/api/admin/categories/${editing.id}` : '/api/admin/categories';
      await api.upload(endpoint, data, editing ? 'PUT' : 'POST');
      await load();
      resetForm();
      showToast(editing ? 'Category updated.' : 'Category created.', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(category: Category) {
    if (!window.confirm(`Delete the "${category.name}" category?`)) return;
    try {
      await api.delete(`/api/admin/categories/${category.id}`);
      if (editing?.id === category.id) resetForm();
      await load();
      showToast('Category removed.', 'success');
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  const currentImage = preview || editing?.imagePath || '';

  return (
    <div>
      <AdminPageHeader
        eyebrow="Taxonomy"
        title="Categories"
        description="Create, edit and remove storefront categories. Category images are uploaded directly from your device."
        action={<button className="btn btn-gold btn-small" type="button" onClick={resetForm}><Plus size={14} /> New Category</button>}
      />

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="admin-card">
          <AdminAsyncState loading={loading} error={error} empty={!categories.length} emptyTitle="No categories" emptyDescription="Create your first category using the form.">
            <div className="admin-table-wrap">
              <table className="admin-table" style={{ minWidth: 620 }}>
                <thead><tr><th>Image</th><th>Category</th><th>Type</th><th>Pieces</th><th>Order</th><th>Actions</th></tr></thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id}>
                      <td><img className="admin-thumb" src={category.imagePath || '/media/seed/editorial/campaign.webp'} alt="" loading="lazy" /></td>
                      <td><div style={{ color: 'var(--white)' }}>{category.name}</div><div className="muted" style={{ fontSize: '.66rem' }}>/{category.slug}</div></td>
                      <td>{category.specialFilter ? <span className="badge">{category.specialFilter.replace('_', ' ')}</span> : <span className="muted">Standard</span>}</td>
                      <td>{category.productCount ?? 0}</td>
                      <td>{category.sortOrder}</td>
                      <td>
                        <div className="flex gap-2">
                          <button className="icon-btn" style={{ width: 36, height: 36 }} type="button" onClick={() => openEdit(category)} aria-label={`Edit ${category.name}`}><Pencil size={15} /></button>
                          <button className="icon-btn" style={{ width: 36, height: 36 }} type="button" onClick={() => remove(category)} aria-label={`Delete ${category.name}`}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminAsyncState>
        </div>

        <form className="panel panel-pad" onSubmit={submit}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="luxe-title" style={{ fontSize: '1.8rem' }}>{editing ? 'Edit category' : 'New category'}</h3>
            {editing && <button className="icon-btn" style={{ width: 36, height: 36 }} type="button" onClick={resetForm} aria-label="Cancel editing"><X size={15} /></button>}
          </div>
          <div className="auth-stack" style={{ marginTop: 20 }}>
            <label>
              <span className="field-label">Name</span>
              <input className="input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={60} />
            </label>
            <label>
              <span className="field-label">Slug (optional)</span>
              <input className="input" value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} placeholder="Auto-generated from name" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
            </label>
            <label>
              <span className="field-label">Description</span>
              <textarea className="textarea" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={300} />
            </label>
            <label>
              <span className="field-label">Collection type</span>
              <select className="select" value={form.specialFilter} onChange={(event) => setForm((current) => ({ ...current, specialFilter: event.target.value as CategoryForm['specialFilter'] }))}>
                <option value="">Standard category</option>
                <option value="new_arrival">New Arrivals filter</option>
                <option value="best_seller">Best Sellers filter</option>
              </select>
            </label>
            <label>
              <span className="field-label">Sort order</span>
              <input className="input" type="number" min="0" max="999" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))} />
            </label>
            <label>
              <span className="field-label">Category image · direct upload</span>
              <div className="upload-drop">
                <Upload size={18} className="gold-text" style={{ margin: '0 auto 8px' }} />
                {imageFile ? imageFile.name : 'Choose an image from your device'}
                <input type="file" accept={ALLOWED_TYPES.join(',')} onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
              </div>
            </label>
            {currentImage && <img src={currentImage} alt="Category preview" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', border: '1px solid var(--line)' }} />}
            <button className="btn btn-gold btn-full" type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Update category' : 'Create category'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
