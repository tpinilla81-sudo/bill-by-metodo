'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Settings, Building2, Upload, Save, Image as ImageIcon, RotateCcw, CheckCircle, Tag, ArrowRightLeft, Clock, Zap, Eye, EyeOff, LayoutList, Pencil, Trash2, Plus, X, GripVertical, ChevronUp, ChevronDown, Users, UserPlus, Shield, Lock } from 'lucide-react'
import {
  useConfig,
  DEFAULT_LABELS_ENTRADA,
  DEFAULT_LABELS_CATALOGO,
  DEFAULT_LABELS_REGISTROS,
  DEFAULT_LABELS_FACTURAS,
  DEFAULT_LABELS_CLIENTES,
  DEFAULT_FIELDS_ENTRADA,
  DEFAULT_FIELDS_CLIENTES,
  DEFAULT_FIELDS_CATALOGO,
  DEFAULT_FIELDS_REGISTROS,
  DEFAULT_FIELDS_FACTURAS,
  type AppConfig,
  type FieldDef,
} from '@/lib/config'
import type { CatalogoItem, Cliente } from '@/lib/hualsa-utils'
import { useTenantFetch } from '@/lib/use-tenant-fetch'
import { useAuth } from '@/lib/auth-context'
import { triggerBackup } from '@/lib/trigger-backup'

// ─── UsersManager: CRUD for users with permissions ────────────
interface UserItem {
  id: string
  email: string
  name: string
  role: string
  tenantId: string
  tenantName: string
  active: boolean
  createdAt: string
}

function UsersManager() {
  const { tenantFetch } = useTenantFetch()
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formEmail, setFormEmail] = useState('')
  const [formName, setFormName] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState('user')
  const [formActive, setFormActive] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const isSuperadmin = currentUser?.role === 'superadmin'

  const loadData = useCallback(async () => {
    try {
      const res = await tenantFetch('/api/users')
      if (res.ok) {
        setUsers(await res.json())
      }
    } catch (err) {
      console.error('Error loading users:', err)
    }
    setLoading(false)
  }, [tenantFetch])

  useEffect(() => { loadData() }, [loadData])

  function showMsg(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 3000)
  }

  function resetForm() {
    setEditingId(null)
    setFormEmail(''); setFormName(''); setFormPassword(''); setFormRole('user'); setFormActive(true)
    setShowForm(false)
  }

  function handleEditUser(u: UserItem) {
    setEditingId(u.id)
    setFormEmail(u.email); setFormName(u.name); setFormPassword(''); setFormRole(u.role); setFormActive(u.active)
    setShowForm(true)
  }

  async function handleSaveUser() {
    if (!formEmail) { showMsg('err', 'El email es obligatorio'); return }
    if (!editingId && !formPassword) { showMsg('err', 'La contraseña es obligatoria para nuevos usuarios'); return }

    try {
      if (editingId) {
        const body: Record<string, unknown> = { id: editingId, email: formEmail, name: formName, role: formRole, active: formActive }
        if (formPassword) body.password = formPassword
        const res = await tenantFetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { const d = await res.json().catch(() => ({})); showMsg('err', d.error || 'Error al actualizar'); return }
        showMsg('ok', 'Usuario actualizado ✓')
      } else {
        const body = { email: formEmail, name: formName, password: formPassword, role: formRole, tenantId: currentUser?.tenantId }
        const res = await tenantFetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { const d = await res.json().catch(() => ({})); showMsg('err', d.error || 'Error al crear usuario'); return }
        showMsg('ok', 'Usuario creado ✓')
      }
      resetForm(); triggerBackup(); loadData()
    } catch { showMsg('err', 'Error de conexión') }
  }

  async function handleToggleActive(u: UserItem) {
    if (u.id === currentUser?.id) { showMsg('err', 'No puedes desactivar tu propia cuenta'); return }
    try {
      const res = await tenantFetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, active: !u.active }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); showMsg('err', d.error || 'Error'); return }
      showMsg('ok', u.active ? 'Usuario desactivado' : 'Usuario activado')
      triggerBackup()
      loadData()
    } catch { showMsg('err', 'Error de conexión') }
  }

  async function handleDeleteUser(u: UserItem) {
    if (u.id === currentUser?.id) { showMsg('err', 'No puedes eliminar tu propia cuenta'); return }
    if (!confirm(`¿Desactivar al usuario "${u.name || u.email}"?`)) return
    try {
      const res = await tenantFetch(`/api/users?id=${u.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); showMsg('err', d.error || 'Error'); return }
      showMsg('ok', 'Usuario desactivado ✓')
      triggerBackup()
      loadData()
    } catch { showMsg('err', 'Error de conexión') }
  }

  function getRoleBadge(role: string) {
    switch (role) {
      case 'superadmin':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">SUPERADMIN</span>
      case 'admin':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">ADMIN</span>
      default:
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">USUARIO</span>
    }
  }

  const roleOptions = isSuperadmin
    ? [
        { value: 'admin', label: 'Admin', desc: 'Acceso completo a su empresa' },
        { value: 'user', label: 'Usuario', desc: 'Solo lectura y entradas' },
      ]
    : [
        { value: 'admin', label: 'Admin', desc: 'Acceso completo a su empresa' },
        { value: 'user', label: 'Usuario', desc: 'Solo lectura y entradas' },
      ]

  if (loading) return <div className="p-6 text-center text-gray-400">Cargando usuarios...</div>

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {statusMsg.type === 'ok' ? <CheckCircle className="h-4 w-4" /> : null}
          {statusMsg.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Gestiona los usuarios de tu empresa y sus permisos de acceso.</p>
        {!showForm && (
          <Button onClick={() => { resetForm(); setShowForm(true) }} className="bg-[#005bb5] hover:bg-[#003d7a] text-white">
            <UserPlus className="h-4 w-4 mr-1.5" /> Nuevo Usuario
          </Button>
        )}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <Card className={`border-l-4 ${editingId ? 'border-l-indigo-500' : 'border-l-[#005bb5]'}`}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {editingId ? <Pencil className="h-4 w-4 text-indigo-500" /> : <UserPlus className="h-4 w-4 text-[#005bb5]" />}
              {editingId ? 'Editar Usuario' : 'Nuevo Usuario'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Email *</Label>
                <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="usuario@empresa.com" />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Nombre</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nombre completo" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Contraseña {editingId ? '(dejar vacío para no cambiar)' : '*'}</Label>
                <Input type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} placeholder={editingId ? '••••••••' : 'Mínimo 6 caracteres'} />
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Rol / Permisos</Label>
                <Select value={formRole} onValueChange={setFormRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roleOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label} — {opt.desc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Role explanation */}
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-700"><Shield className="h-3.5 w-3.5" /> Permisos por rol:</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-blue-700 shrink-0">Admin:</span>
                  <span>Acceso completo a todas las secciones de su empresa. Puede crear, editar y eliminar registros, clientes, catálogo y facturas. Puede gestionar usuarios de su empresa.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-gray-700 shrink-0">Usuario:</span>
                  <span>Puede ver todas las secciones y crear/editar entradas y registros. No puede gestionar usuarios ni modificar la configuración de la empresa.</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveUser} className="bg-[#2bb24c] hover:bg-[#23963e] text-white">
                <Save className="h-4 w-4 mr-1" />{editingId ? 'ACTUALIZAR' : 'CREAR USUARIO'}
              </Button>
              <Button onClick={resetForm} variant="outline">
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-lg border overflow-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#005bb5] text-white">
              <th className="p-2.5 text-left font-semibold">Nombre</th>
              <th className="p-2.5 text-left font-semibold">Email</th>
              <th className="p-2.5 text-left font-semibold">Rol</th>
              <th className="p-2.5 text-center font-semibold">Estado</th>
              <th className="p-2.5 text-center font-semibold">Acc.</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className={`border-b hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''} ${editingId === u.id ? 'bg-indigo-50' : ''}`}>
                <td className="p-2.5 font-medium">{u.name || '—'}</td>
                <td className="p-2.5 text-gray-600">{u.email}</td>
                <td className="p-2.5">{getRoleBadge(u.role)}</td>
                <td className="p-2.5 text-center">
                  <button
                    onClick={() => handleToggleActive(u)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                      u.active
                        ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                        : 'bg-red-50 text-red-600 border-red-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'
                    }`
                    }
                    title={u.active ? 'Click para desactivar' : 'Click para activar'}
                    disabled={u.id === currentUser?.id}
                  >
                    {u.active ? '● Activo' : '○ Inactivo'}
                  </button>
                </td>
                <td className="p-2.5 text-center">
                  <div className="flex justify-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" onClick={() => handleEditUser(u)} title="Editar usuario">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => handleDeleteUser(u)} title="Desactivar usuario" disabled={u.id === currentUser?.id}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-gray-400">No hay usuarios</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── FieldEditor: Edit a single field definition ─────────────
function FieldEditor({
  field,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  field: FieldDef
  onUpdate: (updated: FieldDef) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<FieldDef>(field)

  useEffect(() => { setDraft(field) }, [field])

  function handleSave() {
    onUpdate(draft)
    setEditing(false)
  }

  function handleCancel() {
    setDraft(field)
    setEditing(false)
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all ${
      field.visible
        ? field.isCustom
          ? 'border-amber-300 bg-amber-50/50'
          : 'border-[#2bb24c] bg-green-50/50'
        : 'border-gray-200 bg-white opacity-60'
    }`}>
      {/* Reorder buttons */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={onMoveUp} disabled={isFirst} className="text-gray-400 hover:text-gray-600 disabled:opacity-20">
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button onClick={onMoveDown} disabled={isLast} className="text-gray-400 hover:text-gray-600 disabled:opacity-20">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing ? (
        // Edit mode
        <div className="flex-1 grid grid-cols-[1fr_1fr_120px_auto] gap-2 items-center">
          <Input
            value={draft.label}
            onChange={e => setDraft({ ...draft, label: e.target.value })}
            className="h-8 text-sm"
            placeholder="Etiqueta del campo"
          />
          <Input
            value={draft.key}
            onChange={e => setDraft({ ...draft, key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
            className="h-8 text-sm"
            placeholder="key_campo"
            disabled={!field.isCustom}
          />
          <Select value={draft.type} onValueChange={v => setDraft({ ...draft, type: v as FieldDef['type'] })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Texto</SelectItem>
              <SelectItem value="number">Número</SelectItem>
              <SelectItem value="date">Fecha</SelectItem>
              <SelectItem value="select">Selección</SelectItem>
              <SelectItem value="textarea">Texto largo</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50" onClick={handleSave}>
              <CheckCircle className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500 hover:bg-gray-100" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        // Display mode
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {/* Visibility toggle */}
          <button
            onClick={() => onUpdate({ ...field, visible: !field.visible })}
            className="shrink-0"
            title={field.visible ? 'Ocultar campo' : 'Mostrar campo'}
          >
            {field.visible ? <Eye className="h-4 w-4 text-green-600" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
          </button>

          {/* Field info */}
          <div className="flex-1 min-w-0">
            <span className={`text-sm font-medium ${field.visible ? 'text-gray-700' : 'text-gray-400'}`}>
              {field.label}
            </span>
            <span className="text-xs text-gray-400 ml-2">
              ({field.type}{field.required ? ' · obligatorio' : ''}{field.isCustom ? ' · personalizado' : ''})
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7 text-indigo-600 hover:bg-indigo-50" onClick={() => setEditing(true)} title="Editar campo">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {field.isCustom && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={onDelete} title="Eliminar campo">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── FieldsManager: Full CRUD for field definitions per section ───
function FieldsManager({
  title,
  icon,
  fields,
  defaultFields,
  configKey,
  onUpdate,
}: {
  title: string
  icon: React.ReactNode
  fields: FieldDef[]
  defaultFields: FieldDef[]
  configKey: string
  onUpdate: (configKey: string, fields: FieldDef[]) => void
}) {
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState<FieldDef['type']>('text')

  function handleAddField() {
    if (!newFieldLabel.trim()) return
    // Generate a key from label
    const key = 'custom_' + newFieldLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    // Ensure key is unique
    let finalKey = key
    let counter = 1
    while (fields.some(f => f.key === finalKey)) {
      finalKey = `${key}_${counter++}`
    }
    const newField: FieldDef = {
      key: finalKey,
      label: newFieldLabel.trim(),
      type: newFieldType,
      visible: true,
      isCustom: true,
      required: false,
      placeholder: newFieldLabel.trim(),
    }
    onUpdate(configKey, [...fields, newField])
    setNewFieldLabel('')
  }

  function handleUpdateField(index: number, updated: FieldDef) {
    const newFields = [...fields]
    newFields[index] = updated
    onUpdate(configKey, newFields)
  }

  function handleDeleteField(index: number) {
    if (!fields[index].isCustom) return
    if (!confirm(`¿Eliminar el campo "${fields[index].label}"? Los datos guardados en este campo se perderán.`)) return
    onUpdate(configKey, fields.filter((_, i) => i !== index))
  }

  function handleMoveUp(index: number) {
    if (index === 0) return
    const newFields = [...fields]
    const temp = newFields[index]
    newFields[index] = newFields[index - 1]
    newFields[index - 1] = temp
    onUpdate(configKey, newFields)
  }

  function handleMoveDown(index: number) {
    if (index === fields.length - 1) return
    const newFields = [...fields]
    const temp = newFields[index]
    newFields[index] = newFields[index + 1]
    newFields[index + 1] = temp
    onUpdate(configKey, newFields)
  }

  function handleRestore() {
    if (!confirm('¿Restaurar campos por defecto? Se perderán los campos personalizados.')) return
    onUpdate(configKey, defaultFields)
  }

  const coreFields = fields.filter(f => !f.isCustom)
  const customFields = fields.filter(f => f.isCustom)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {icon} {title}
          <span className="text-xs text-gray-400 ml-auto">{fields.length} campos ({customFields.length} personalizados)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Gestiona los campos de esta sección. Puedes mostrar/ocultar, editar etiquetas, reordenar y añadir campos personalizados.
          Los campos base no se pueden eliminar, solo ocultar.
        </p>

        {/* Field list */}
        <div className="space-y-1.5">
          {fields.map((field, index) => (
            <FieldEditor
              key={field.key}
              field={field}
              onUpdate={(updated) => handleUpdateField(index, updated)}
              onDelete={() => handleDeleteField(index)}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
              isFirst={index === 0}
              isLast={index === fields.length - 1}
            />
          ))}
        </div>

        {/* Add new custom field */}
        <div className="flex items-center gap-2 pt-2 border-t border-dashed border-gray-200">
          <Plus className="h-4 w-4 text-gray-400 shrink-0" />
          <Input
            value={newFieldLabel}
            onChange={e => setNewFieldLabel(e.target.value)}
            placeholder="Nombre del nuevo campo..."
            className="h-9 text-sm flex-1"
            onKeyDown={e => { if (e.key === 'Enter') handleAddField() }}
          />
          <Select value={newFieldType} onValueChange={v => setNewFieldType(v as FieldDef['type'])}>
            <SelectTrigger className="h-9 text-sm w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Texto</SelectItem>
              <SelectItem value="number">Número</SelectItem>
              <SelectItem value="date">Fecha</SelectItem>
              <SelectItem value="select">Selección</SelectItem>
              <SelectItem value="textarea">Texto largo</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleAddField}
            disabled={!newFieldLabel.trim()}
            size="sm"
            className="bg-[#2bb24c] hover:bg-[#23963e] text-white h-9"
          >
            <Plus className="h-4 w-4 mr-1" /> AÑADIR
          </Button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs text-gray-400 pt-1">
          <span className="flex items-center gap-1"><Eye className="h-3 w-3 text-green-500" /> Visible</span>
          <span className="flex items-center gap-1"><EyeOff className="h-3 w-3" /> Oculto</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-amber-300 bg-amber-50/50 inline-block" /> Personalizado</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-[#2bb24c] bg-green-50/50 inline-block" /> Base</span>
        </div>

        {/* Restore button */}
        <div className="flex justify-end">
          <button onClick={handleRestore} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <RotateCcw className="h-3 w-3" /> Restaurar por defecto
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

interface TenantInfo {
  id: string
  name: string
  fullName: string
  logo: string
  address: string
  city: string
  province: string
  cif: string
}

export function ConfiguracionView({ tenant }: { tenant: TenantInfo | null }) {
  const { raw, config, update, loading } = useConfig()
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Local state for editing (initialized from config)
  const [companyName, setCompanyName] = useState('')
  const [companyFullName, setCompanyFullName] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [companyCity, setCompanyCity] = useState('')
  const [companyProvince, setCompanyProvince] = useState('')
  const [companyCif, setCompanyCif] = useState('')
  const [currency, setCurrency] = useState('€')
  const [defaultIva, setDefaultIva] = useState('21')
  const [appName, setAppName] = useState('')

  const [sectionEntrada, setSectionEntrada] = useState('')
  const [sectionRegistros, setSectionRegistros] = useState('')
  const [sectionClientes, setSectionClientes] = useState('')
  const [sectionCatalogo, setSectionCatalogo] = useState('')
  const [sectionFacturas, setSectionFacturas] = useState('')
  const [sectionBackup, setSectionBackup] = useState('')

  const [transferMode, setTransferMode] = useState('auto')
  const [transferTime, setTransferTime] = useState('00:00')

  const [labelsEntrada, setLabelsEntrada] = useState(DEFAULT_LABELS_ENTRADA)
  const [labelsCatalogo, setLabelsCatalogo] = useState(DEFAULT_LABELS_CATALOGO)
  const [labelsRegistros, setLabelsRegistros] = useState(DEFAULT_LABELS_REGISTROS)
  const [labelsFacturas, setLabelsFacturas] = useState(DEFAULT_LABELS_FACTURAS)
  const [labelsClientes, setLabelsClientes] = useState(DEFAULT_LABELS_CLIENTES)

  // Field definitions (new dynamic system)
  const [fieldsEntrada, setFieldsEntrada] = useState<FieldDef[]>(DEFAULT_FIELDS_ENTRADA)
  const [fieldsClientes, setFieldsClientes] = useState<FieldDef[]>(DEFAULT_FIELDS_CLIENTES)
  const [fieldsCatalogo, setFieldsCatalogo] = useState<FieldDef[]>(DEFAULT_FIELDS_CATALOGO)
  const [fieldsRegistros, setFieldsRegistros] = useState<FieldDef[]>(DEFAULT_FIELDS_REGISTROS)
  const [fieldsFacturas, setFieldsFacturas] = useState<FieldDef[]>(DEFAULT_FIELDS_FACTURAS)

  const [logoPreview, setLogoPreview] = useState('')
  const [logoBase64, setLogoBase64] = useState('')

  // Initialize local state from config whenever the config data changes (e.g. after tenant switch)
  // Use raw?.id as a stable reference to avoid infinite re-render loops
  useEffect(() => {
    if (config && raw) {
      setCompanyName(raw.companyName); setCompanyFullName(raw.companyFullName); setCompanyAddress(raw.companyAddress)
      setCompanyCity(raw.companyCity); setCompanyProvince(raw.companyProvince); setCompanyCif(raw.companyCif)
      setCurrency(raw.currency); setDefaultIva(String(raw.defaultIva)); setAppName(raw.appName)
      setSectionEntrada(raw.sectionEntrada); setSectionRegistros(raw.sectionRegistros); setSectionClientes(raw.sectionClientes)
      setSectionCatalogo(raw.sectionCatalogo); setSectionFacturas(raw.sectionFacturas); setSectionBackup(raw.sectionBackup)
      setTransferMode(raw.transferMode || 'auto'); setTransferTime(raw.transferTime || '00:00')
      setLabelsEntrada(config.labelsEntrada); setLabelsCatalogo(config.labelsCatalogo)
      setLabelsRegistros(config.labelsRegistros); setLabelsFacturas(config.labelsFacturas); setLabelsClientes(config.labelsClientes)
      setFieldsEntrada(config.fieldsEntrada); setFieldsClientes(config.fieldsClientes)
      setFieldsCatalogo(config.fieldsCatalogo); setFieldsRegistros(config.fieldsRegistros); setFieldsFacturas(config.fieldsFacturas)
      if (raw.logo) { setLogoPreview(raw.logo.startsWith('data:') ? raw.logo : `data:image/png;base64,${raw.logo}`) }
      else { setLogoPreview('') }
      // Reset logo base64 since we just loaded from server
      setLogoBase64('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw?.id, raw?.tenantId])

  function showStatus(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 4000)
  }

  // Handle field definition update
  function handleFieldsUpdate(configKey: string, newFields: FieldDef[]) {
    switch (configKey) {
      case 'fieldsEntrada': setFieldsEntrada(newFields); break
      case 'fieldsClientes': setFieldsClientes(newFields); break
      case 'fieldsCatalogo': setFieldsCatalogo(newFields); break
      case 'fieldsRegistros': setFieldsRegistros(newFields); break
      case 'fieldsFacturas': setFieldsFacturas(newFields); break
    }
  }

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { showStatus('err', 'El logo debe ser menor de 2MB'); return }
    const reader = new FileReader()
    reader.onload = (evt) => { const dataUrl = evt.target?.result as string; setLogoPreview(dataUrl); setLogoBase64(dataUrl) }
    reader.readAsDataURL(file)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  function handleRemoveLogo() { setLogoPreview(''); setLogoBase64('REMOVE') }

  async function handleSave() {
    setSaving(true)
    try {
      const partial: Partial<AppConfig> = {
        companyName, companyFullName, companyAddress, companyCity, companyProvince, companyCif,
        currency, defaultIva: Number(defaultIva) || 21, appName,
        sectionEntrada, sectionRegistros, sectionClientes, sectionCatalogo, sectionFacturas, sectionBackup,
        transferMode, transferTime,
        labelEntrada: JSON.stringify(labelsEntrada), labelCatalogo: JSON.stringify(labelsCatalogo),
        labelRegistros: JSON.stringify(labelsRegistros), labelFacturas: JSON.stringify(labelsFacturas),
        labelClientes: JSON.stringify(labelsClientes),
        fieldsEntrada: JSON.stringify(fieldsEntrada), fieldsClientes: JSON.stringify(fieldsClientes),
        fieldsCatalogo: JSON.stringify(fieldsCatalogo), fieldsRegistros: JSON.stringify(fieldsRegistros),
        fieldsFacturas: JSON.stringify(fieldsFacturas),
      }
      if (logoBase64 === 'REMOVE') { partial.logo = '' } else if (logoBase64) { partial.logo = logoBase64 }
      await update(partial)
      triggerBackup()
      showStatus('ok', 'Configuración guardada ✓')
    } catch (err) { showStatus('err', 'Error guardando: ' + String(err)) }
    setSaving(false)
  }

  if (loading || !config) {
    return <div className="p-6 text-center text-gray-400">Cargando configuración...</div>
  }

  return (
    <div className="max-w-4xl flex flex-col flex-1 min-h-0 gap-4 overflow-auto">
      {statusMsg && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {statusMsg.type === 'ok' ? <CheckCircle className="h-4 w-4" /> : null}
          {statusMsg.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-[#005bb5]" />
          <h2 className="text-lg font-bold text-gray-700">Configuración</h2>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#2bb24c] hover:bg-[#23963e] text-white">
          <Save className="h-4 w-4 mr-1" />{saving ? 'Guardando...' : 'GUARDAR TODO'}
        </Button>
      </div>

      <Tabs defaultValue="empresa" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="empresa"><Building2 className="h-4 w-4 mr-1.5" /> Empresa</TabsTrigger>
          <TabsTrigger value="usuarios"><Users className="h-4 w-4 mr-1.5" /> Usuarios</TabsTrigger>
          <TabsTrigger value="campos"><LayoutList className="h-4 w-4 mr-1.5" /> Campos</TabsTrigger>
        </TabsList>

        {/* ─── EMPRESA TAB ─────────────────────────────── */}
        <TabsContent value="empresa" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Logotipo</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                <div className="w-[180px] h-[60px] border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-white overflow-hidden shrink-0">
                  {logoPreview ? <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-gray-400">Sin logo</span>}
                </div>
                <div className="space-y-2">
                  <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/gif,image/webp" className="hidden" onChange={handleLogoSelect} />
                  <Button onClick={() => logoInputRef.current?.click()} variant="outline" size="sm"><Upload className="h-4 w-4 mr-1.5" /> Subir Logo</Button>
                  {logoPreview && <Button onClick={handleRemoveLogo} variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50 ml-2"><RotateCcw className="h-4 w-4 mr-1.5" /> Quitar</Button>}
                  <p className="text-[11px] text-gray-400">PNG, JPG, SVG o WebP. Máximo 2MB.</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Datos de la Empresa</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {/* Tenant info banner */}
              {tenant && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-[#005bb5] shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-800">{tenant.name}</span>
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold">FIJO</span>
                    </div>
                    {tenant.fullName && <p className="text-xs text-gray-500">{tenant.fullName}</p>}
                    {tenant.cif && <p className="text-xs text-gray-500">CIF: {tenant.cif}</p>}
                  </div>
                  <p className="text-[10px] text-gray-400 text-right">Nombre de empresa asignado<br/>por el administrador</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label className="text-xs uppercase font-bold text-slate-500">Razón Social</Label><Input value={companyFullName} onChange={e => setCompanyFullName(e.target.value)} placeholder="Mi Empresa S.L." /></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">CIF</Label><Input value={companyCif} onChange={e => setCompanyCif(e.target.value)} placeholder="B12345678" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label className="text-xs uppercase font-bold text-slate-500">Dirección</Label><Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="C/ Example, Nº 1" /></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Ciudad / C.P.</Label><Input value={companyCity} onChange={e => setCompanyCity(e.target.value)} placeholder="28001 Madrid" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><Label className="text-xs uppercase font-bold text-slate-500">Provincia</Label><Input value={companyProvince} onChange={e => setCompanyProvince(e.target.value)} placeholder="Madrid" /></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Moneda</Label><Input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="€" className="w-24" /></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">IVA por defecto (%)</Label><Input type="number" step="0.01" value={defaultIva} onChange={e => setDefaultIva(e.target.value)} className="w-32" /></div>
              </div>

            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4" /> Nombres de Secciones</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">Personaliza los nombres de las secciones en el menú lateral.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><Label className="text-xs uppercase font-bold text-slate-500">Sección Entrada</Label><Input value={sectionEntrada} onChange={e => setSectionEntrada(e.target.value)} /></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Sección Registros</Label><Input value={sectionRegistros} onChange={e => setSectionRegistros(e.target.value)} /></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Sección Clientes</Label><Input value={sectionClientes} onChange={e => setSectionClientes(e.target.value)} /></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Sección Catálogo</Label><Input value={sectionCatalogo} onChange={e => setSectionCatalogo(e.target.value)} /></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Sección Facturas</Label><Input value={sectionFacturas} onChange={e => setSectionFacturas(e.target.value)} /></div>
                <div><Label className="text-xs uppercase font-bold text-slate-500">Sección Seguridad</Label><Input value={sectionBackup} onChange={e => setSectionBackup(e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── USUARIOS TAB ────────────────────────────── */}
        <TabsContent value="usuarios" className="space-y-4 mt-4">
          <UsersManager />
        </TabsContent>

        {/* ─── CAMPOS TAB (Full CRUD for fields) ────────── */}
        <TabsContent value="campos" className="space-y-4 mt-4">
          <p className="text-sm text-gray-500">
            Gestiona los campos de cada sección. Puedes añadir nuevos campos personalizados, editar los existentes, ocultarlos o eliminarlos.
            Los campos base (verde) son esenciales y solo se pueden ocultar. Los campos personalizados (ámbar) se pueden eliminar.
          </p>

          <FieldsManager
            title="Campos — Entrada"
            icon={<Eye className="h-4 w-4 text-[#2bb24c]" />}
            fields={fieldsEntrada}
            defaultFields={DEFAULT_FIELDS_ENTRADA}
            configKey="fieldsEntrada"
            onUpdate={handleFieldsUpdate}
          />

          <FieldsManager
            title="Campos — Clientes"
            icon={<Eye className="h-4 w-4 text-[#005bb5]" />}
            fields={fieldsClientes}
            defaultFields={DEFAULT_FIELDS_CLIENTES}
            configKey="fieldsClientes"
            onUpdate={handleFieldsUpdate}
          />

          <FieldsManager
            title="Campos — Catálogo"
            icon={<Eye className="h-4 w-4 text-amber-500" />}
            fields={fieldsCatalogo}
            defaultFields={DEFAULT_FIELDS_CATALOGO}
            configKey="fieldsCatalogo"
            onUpdate={handleFieldsUpdate}
          />

          <FieldsManager
            title="Campos — Registros"
            icon={<Eye className="h-4 w-4 text-[#005bb5]" />}
            fields={fieldsRegistros}
            defaultFields={DEFAULT_FIELDS_REGISTROS}
            configKey="fieldsRegistros"
            onUpdate={handleFieldsUpdate}
          />

          <FieldsManager
            title="Campos — Facturas"
            icon={<Eye className="h-4 w-4 text-indigo-500" />}
            fields={fieldsFacturas}
            defaultFields={DEFAULT_FIELDS_FACTURAS}
            configKey="fieldsFacturas"
            onUpdate={handleFieldsUpdate}
          />
        </TabsContent>


      </Tabs>
    </div>
  )
}
