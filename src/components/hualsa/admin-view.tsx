'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Building2, Users, Plus, Pencil, Trash2, CheckCircle, Shield, Copy, Eye, EyeOff, KeyRound, CreditCard, Zap, Clock, TrendingUp } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────
interface Tenant {
  id: string
  name: string
  slug: string
  fullName: string
  address: string
  city: string
  province: string
  cif: string
  logo: string
  active: boolean
  plan: string
  planStatus: string
  planExpiresAt: string | null
  maxUsers: number
  maxRegistros: number
  userCount: number
  registroCount: number
  createdAt: string
}

interface AutoUser {
  id: string
  email: string
  password: string
  name: string
  role: string
}

interface UserItem {
  id: string
  email: string
  name: string
  role: string
  tenantId: string
  tenantName: string
  active: boolean
  permissions: string
  createdAt: string
}

// Screen permissions available for regular users
const SCREEN_OPTIONS = [
  { key: 'entrada', label: 'Entrada' },
  { key: 'entrada.pasarRegistros', label: '  ↳ Pasar a Registros', parent: 'entrada' },
  { key: 'entrada.grilla', label: '  ↳ Entrada Masiva (Grilla)', parent: 'entrada' },
  { key: 'registros', label: 'Registros' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'catalogo', label: 'Catálogo' },
  { key: 'facturas', label: 'Facturas' },
  { key: 'backup', label: 'Seguridad (Backup)' },
] as const

// Plan configuration
const PLAN_CONFIG: Record<string, { label: string; maxUsers: number; maxRegistros: number; desc: string; color: string }> = {
  gratuito: { label: 'Gratuito', maxUsers: 1, maxRegistros: 100, desc: 'Sin soporte', color: 'bg-gray-100 text-gray-700' },
  mensual: { label: 'Mensual', maxUsers: 5, maxRegistros: 5000, desc: 'Soporte email', color: 'bg-blue-100 text-blue-700' },
  trimestral: { label: 'Trimestral', maxUsers: 15, maxRegistros: 20000, desc: 'Soporte prioritario', color: 'bg-purple-100 text-purple-700' },
  anual: { label: 'Anual', maxUsers: 999, maxRegistros: 999999, desc: 'Soporte dedicado', color: 'bg-amber-100 text-amber-700' },
}

// Parse permissions from JSON string
function parsePermissions(permsStr: string): string[] {
  if (!permsStr || permsStr.trim() === '') return []
  try {
    const parsed = JSON.parse(permsStr)
    if (Array.isArray(parsed)) return parsed
    return []
  } catch {
    return []
  }
}

// ─── Tenants Tab ─────────────────────────────────────────────
function TenantsTab() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [createdCredentials, setCreatedCredentials] = useState<AutoUser | null>(null)

  // Form state — only name needed for creation
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formActive, setFormActive] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants')
      if (res.ok) setTenants(await res.json())
    } catch (err) {
      console.error('Error loading tenants:', err)
    }
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData() }, [loadData])

  function showMsg(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 5000)
  }

  function resetForm() {
    setEditId(null); setFormName(''); setFormSlug('')
    setFormActive(true); setShowDialog(false)
  }

  function openCreate() {
    resetForm()
    setShowDialog(true)
  }

  function openEdit(t: Tenant) {
    setEditId(t.id); setFormName(t.name); setFormSlug(t.slug); setFormActive(t.active)
    setShowDialog(true)
  }

  // Auto-generate slug from name
  function handleNameChange(name: string) {
    setFormName(name)
    if (!editId) {
      const slug = name.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
      setFormSlug(slug)
    }
  }

  async function handleSave() {
    if (!editId && !formName.trim()) {
      showMsg('err', 'El nombre es obligatorio')
      return
    }

    try {
      if (editId) {
        // Update — only active status can be changed by superadmin
        const res = await fetch('/api/tenants', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editId,
            active: formActive,
          }),
        })
        if (!res.ok) { const d = await res.json(); showMsg('err', d.error); return }
        showMsg('ok', 'Empresa actualizada ✓')
      } else {
        // Create — name only, this also auto-creates an admin user
        const res = await fetch('/api/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName,
            slug: formSlug,
          }),
        })
        if (!res.ok) { const d = await res.json(); showMsg('err', d.error); return }
        const data = await res.json()
        showMsg('ok', 'Empresa creada con usuario admin automático ✓')
        // Show the auto-generated credentials
        if (data.autoUser) {
          setCreatedCredentials(data.autoUser)
        }
      }
      resetForm()
      loadData()
    } catch {
      showMsg('err', 'Error de conexión')
    }
  }

  async function handleToggleActive(t: Tenant) {
    const newActive = !t.active
    if (!confirm(`¿${newActive ? 'Activar' : 'Desactivar'} la empresa "${t.name}"?`)) return

    try {
      const res = await fetch('/api/tenants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, active: newActive }),
      })
      if (!res.ok) { showMsg('err', 'Error al actualizar'); return }
      showMsg('ok', `Empresa ${newActive ? 'activada' : 'desactivada'} ✓`)
      loadData()
    } catch {
      showMsg('err', 'Error de conexión')
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    showMsg('ok', 'Copiado al portapapeles ✓')
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Cargando empresas...</div>

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {statusMsg.type === 'ok' && <CheckCircle className="h-4 w-4" />}
          {statusMsg.text}
        </div>
      )}

      {/* Credentials display dialog */}
      {createdCredentials && (
        <Card className="border-2 border-[#2bb24c] bg-green-50/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-[#2bb24c]" />
              Credenciales generadas automáticamente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">
              Se ha creado un usuario administrador para esta empresa. <strong>Guarda estas credenciales</strong>, la contraseña no se volverá a mostrar.
            </p>
            <div className="bg-white rounded-lg p-4 space-y-2 border">
              <div className="flex items-center gap-2">
                <Label className="text-xs uppercase font-bold text-slate-500 w-24">Email:</Label>
                <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded flex-1">{createdCredentials.email}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToClipboard(createdCredentials.email)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs uppercase font-bold text-slate-500 w-24">Contraseña:</Label>
                <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded flex-1">{createdCredentials.password}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToClipboard(createdCredentials.password)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs uppercase font-bold text-slate-500 w-24">Rol:</Label>
                <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">
                  <Shield className="h-3 w-3" /> Admin
                </span>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
              El administrador de la empresa deberá completar los datos (razón social, CIF, dirección, logo...) desde Configuración.
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setCreatedCredentials(null)}>
                Cerrar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Crea empresas con el nombre. Los datos, logo, etc. los completa el admin de cada empresa desde Configuración.</p>
        <Button onClick={openCreate} className="bg-[#005bb5] hover:bg-[#004a94] text-white">
          <Plus className="h-4 w-4 mr-1" /> Nueva Empresa
        </Button>
      </div>

      <div className="bg-white rounded-lg border overflow-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-50">
              <th className="p-3 text-left font-semibold border-b">Nombre</th>
              <th className="p-3 text-left font-semibold border-b">Slug</th>
              <th className="p-3 text-center font-semibold border-b">Plan</th>
              <th className="p-3 text-center font-semibold border-b">Usuarios</th>
              <th className="p-3 text-center font-semibold border-b">Registros</th>
              <th className="p-3 text-center font-semibold border-b">Estado</th>
              <th className="p-3 text-center font-semibold border-b">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(t => {
              const planCfg = PLAN_CONFIG[t.plan] || PLAN_CONFIG.gratuito
              return (
                <tr key={t.id} className={`border-b hover:bg-gray-50 ${!t.active ? 'opacity-50' : ''}`}>
                  <td className="p-3 font-bold text-gray-800">{t.name}</td>
                  <td className="p-3 text-gray-500 font-mono text-xs">{t.slug}</td>
                  <td className="p-3 text-center">
                    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${planCfg.color}`}>
                      {planCfg.label}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`inline-flex items-center justify-center text-xs font-bold px-2.5 py-1 rounded-full ${t.userCount >= t.maxUsers && t.maxUsers > 0 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {t.userCount}/{t.maxUsers >= 999 ? '∞' : t.maxUsers}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`inline-flex items-center justify-center text-xs font-bold px-2.5 py-1 rounded-full ${t.registroCount >= t.maxRegistros && t.maxRegistros < 999999 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {t.registroCount}/{t.maxRegistros >= 999999 ? '∞' : t.maxRegistros.toLocaleString()}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => handleToggleActive(t)} className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full cursor-pointer transition-colors ${t.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>
                      {t.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="p-3 text-center">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-[#005bb5] hover:bg-blue-50" onClick={() => openEdit(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              )
            })}
            {tenants.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">No hay empresas creadas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) resetForm() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#005bb5]" />
              {editId ? 'Editar Empresa' : 'Nueva Empresa'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Nombre de la empresa</Label>
              {editId ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input value={formName} disabled className="bg-gray-50 text-gray-500" />
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold whitespace-nowrap">FIJO</span>
                </div>
              ) : (
                <Input value={formName} onChange={e => handleNameChange(e.target.value)} placeholder="Ej: Transportes Hualsa" className="mt-1" />
              )}
            </div>
            {!editId && formSlug && (
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Slug (auto-generado)</Label>
                <Input value={formSlug} disabled className="bg-gray-50 text-gray-500 font-mono mt-1" />
                <p className="text-[10px] text-gray-400 mt-1">Se creará el admin: <strong>{formSlug}@bill.es</strong></p>
              </div>
            )}

            {/* Active toggle (only for edit) */}
            {editId && (
              <div className="flex items-center gap-3">
                <Label className="text-xs uppercase font-bold text-slate-500">Activo</Label>
                <Switch checked={formActive} onCheckedChange={setFormActive} />
                <span className={`text-xs font-bold ${formActive ? 'text-green-600' : 'text-red-500'}`}>
                  {formActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            )}

            {/* Info banner for creation */}
            {!editId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                <KeyRound className="h-4 w-4 text-[#005bb5] mt-0.5 shrink-0" />
                <div className="text-xs text-blue-700 space-y-1">
                  <p>Al crear la empresa se generará automáticamente un usuario administrador con email <strong>{formSlug || '...'}@bill.es</strong> y una contraseña aleatoria.</p>
                  <p>El administrador de la empresa completará los datos (razón social, CIF, dirección, logo...) desde su sección de Configuración.</p>
                  <p>La empresa se crea con el plan <strong>Gratuito</strong> (1 usuario, 100 registros). Puedes cambiar el plan desde la pestaña Suscripciones.</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={handleSave} className="bg-[#2bb24c] hover:bg-[#23963e] text-white">
              <CheckCircle className="h-4 w-4 mr-1" /> {editId ? 'ACTUALIZAR' : 'CREAR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Users Tab ───────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // Form state
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formName, setFormName] = useState('')
  const [formRole, setFormRole] = useState('user')
  const [formTenantId, setFormTenantId] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [formPermissions, setFormPermissions] = useState<string[]>([])

  const loadData = useCallback(async () => {
    try {
      const [uRes, tRes] = await Promise.all([fetch('/api/users'), fetch('/api/tenants')])
      if (uRes.ok) setUsers(await uRes.json())
      if (tRes.ok) setTenants(await tRes.json())
    } catch (err) {
      console.error('Error loading users:', err)
    }
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData() }, [loadData])

  function showMsg(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 3000)
  }

  function resetForm() {
    setEditId(null); setFormEmail(''); setFormPassword(''); setFormName('')
    setFormRole('user'); setFormTenantId(''); setFormActive(true); setShowDialog(false)
    setShowPassword(false); setFormPermissions([])
  }

  function openCreate() {
    resetForm()
    if (tenants.length > 0) setFormTenantId(tenants[0].id)
    setShowDialog(true)
  }

  function openEdit(u: UserItem) {
    setEditId(u.id); setFormEmail(u.email); setFormPassword(''); setFormName(u.name)
    setFormRole(u.role); setFormTenantId(u.tenantId); setFormActive(u.active)
    setFormPermissions(parsePermissions(u.permissions || ''))
    setShowDialog(true)
  }

  function togglePermission(key: string) {
    setFormPermissions(prev => {
      const next = prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
      // If unchecking a parent, also remove all child permissions
      if (!next.includes(key)) {
        const childKeys = SCREEN_OPTIONS.filter(o => (o as any).parent === key).map(o => o.key)
        return next.filter(p => !childKeys.includes(p))
      }
      return next
    })
  }

  async function handleSave() {
    if (!editId && (!formEmail.trim() || !formPassword.trim())) {
      showMsg('err', 'Email y contraseña son obligatorios')
      return
    }
    if (!formTenantId) {
      showMsg('err', 'Selecciona una empresa')
      return
    }

    try {
      if (editId) {
        const body: Record<string, unknown> = {
          id: editId,
          name: formName,
          role: formRole,
          tenantId: formTenantId,
          active: formActive,
          permissions: formRole === 'user' ? formPermissions : [],
        }
        if (formEmail.trim()) body.email = formEmail.trim()
        if (formPassword.trim()) body.password = formPassword.trim()

        const res = await fetch('/api/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) { const d = await res.json(); showMsg('err', d.error); return }
        showMsg('ok', 'Usuario actualizado ✓')
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formEmail.trim(),
            password: formPassword,
            name: formName,
            role: formRole,
            tenantId: formTenantId,
            permissions: formRole === 'user' ? formPermissions : [],
          }),
        })
        if (!res.ok) { const d = await res.json(); showMsg('err', d.error); return }
        showMsg('ok', 'Usuario creado ✓')
      }
      resetForm()
      loadData()
    } catch {
      showMsg('err', 'Error de conexión')
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm('¿Desactivar este usuario?')) return
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); showMsg('err', d.error || 'Error al desactivar'); return }
      showMsg('ok', 'Usuario desactivado ✓')
      loadData()
    } catch {
      showMsg('err', 'Error de conexión')
    }
  }

  function getRoleBadge(role: string) {
    switch (role) {
      case 'superadmin':
        return <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700"><Shield className="h-3 w-3" /> SuperAdmin</span>
      case 'admin':
        return <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700"><Shield className="h-3 w-3" /> Admin</span>
      default:
        return <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600"><Users className="h-3 w-3" /> Usuario</span>
    }
  }

  function getPermsSummary(permsStr: string) {
    const perms = parsePermissions(permsStr)
    if (perms.length === 0) return <span className="text-xs text-gray-400">Todo</span>
    return (
      <div className="flex flex-wrap gap-1">
        {perms.map(p => {
          const opt = SCREEN_OPTIONS.find(o => o.key === p)
          return <span key={p} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">{opt?.label || p}</span>
        })}
      </div>
    )
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Cargando usuarios...</div>

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {statusMsg.type === 'ok' && <CheckCircle className="h-4 w-4" />}
          {statusMsg.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Gestiona los usuarios del sistema.</p>
        <Button onClick={openCreate} className="bg-[#005bb5] hover:bg-[#004a94] text-white">
          <Plus className="h-4 w-4 mr-1" /> Nuevo Usuario
        </Button>
      </div>

      <div className="bg-white rounded-lg border overflow-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-50">
              <th className="p-3 text-left font-semibold border-b">Email</th>
              <th className="p-3 text-left font-semibold border-b">Nombre</th>
              <th className="p-3 text-center font-semibold border-b">Rol</th>
              <th className="p-3 text-left font-semibold border-b">Empresa</th>
              <th className="p-3 text-left font-semibold border-b">Permisos</th>
              <th className="p-3 text-center font-semibold border-b">Estado</th>
              <th className="p-3 text-center font-semibold border-b">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className={`border-b hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
                <td className="p-3 font-medium text-gray-800">{u.email}</td>
                <td className="p-3 text-gray-600">{u.name || '—'}</td>
                <td className="p-3 text-center">{getRoleBadge(u.role)}</td>
                <td className="p-3 text-gray-600">{u.tenantName}</td>
                <td className="p-3">{u.role === 'user' ? getPermsSummary(u.permissions) : <span className="text-xs text-gray-400">Todo</span>}</td>
                <td className="p-3 text-center">
                  <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {u.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-[#005bb5] hover:bg-blue-50" onClick={() => openEdit(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50" onClick={() => handleDeactivate(u.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">No hay usuarios creados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) resetForm() }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#005bb5]" />
              {editId ? 'Editar Usuario' : 'Nuevo Usuario'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Email</Label>
              <Input
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                className="mt-1"
                disabled={!!editId}
              />
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">
                {editId ? 'Nueva Contraseña (dejar vacío para mantener)' : 'Contraseña'}
              </Label>
              <div className="relative mt-1">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                  placeholder={editId ? '••••••••' : 'Contraseña'}
                  required={!editId}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Nombre</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nombre completo" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Rol</Label>
                <Select value={formRole} onValueChange={(val) => {
                  setFormRole(val)
                  if (val !== 'user') setFormPermissions([])
                }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuario</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="superadmin">SuperAdmin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Empresa</Label>
                <Select value={formTenantId} onValueChange={setFormTenantId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {tenants.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Permissions Section - only for "user" role */}
            {formRole === 'user' && (
              <div className="border rounded-lg p-3 bg-gray-50/50">
                <Label className="text-xs uppercase font-bold text-slate-500 mb-2 block">Permisos de Pantallas</Label>
                <p className="text-[11px] text-gray-500 mb-3">Selecciona las pantallas a las que este usuario tendrá acceso. Si no seleccionas ninguna, tendrá acceso a todo.</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {SCREEN_OPTIONS.map(opt => {
                    const parentKey = (opt as any).parent as string | undefined
                    const isChild = !!parentKey
                    const parentChecked = parentKey ? formPermissions.includes(parentKey) : true
                    return (
                      <label key={opt.key} className={`flex items-center gap-2 px-3 py-2 rounded-md border bg-white hover:bg-blue-50/50 cursor-pointer transition-colors ${isChild ? 'ml-6 border-dashed' : ''} ${isChild && !parentChecked ? 'opacity-40 pointer-events-none' : ''}`}>
                        <Checkbox
                          checked={formPermissions.includes(opt.key)}
                          onCheckedChange={() => togglePermission(opt.key)}
                          disabled={isChild && !parentChecked}
                        />
                        <span className={`text-sm ${isChild ? 'text-gray-500 italic' : 'text-gray-700'}`}>{opt.label.replace(/^\s*↳\s*/, '↳ ')}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Info for admin/superadmin role */}
            {formRole !== 'user' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                Los administradores tienen acceso a todas las pantallas. No es necesario configurar permisos.
              </div>
            )}

            {editId && (
              <div className="flex items-center gap-3">
                <Label className="text-xs uppercase font-bold text-slate-500">Activo</Label>
                <Switch checked={formActive} onCheckedChange={setFormActive} />
                <span className={`text-xs font-bold ${formActive ? 'text-green-600' : 'text-red-500'}`}>
                  {formActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button onClick={handleSave} className="bg-[#2bb24c] hover:bg-[#23963e] text-white">
              <CheckCircle className="h-4 w-4 mr-1" /> {editId ? 'ACTUALIZAR' : 'CREAR'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Subscriptions Tab ───────────────────────────────────────
function SubscriptionsTab() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [editTenant, setEditTenant] = useState<Tenant | null>(null)

  // Form state
  const [formPlan, setFormPlan] = useState('gratuito')
  const [formPlanStatus, setFormPlanStatus] = useState('activo')
  const [formPlanExpiresAt, setFormPlanExpiresAt] = useState('')

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants')
      if (res.ok) setTenants(await res.json())
    } catch (err) {
      console.error('Error loading tenants:', err)
    }
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData() }, [loadData])

  function showMsg(type: 'ok' | 'err', text: string) {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 5000)
  }

  function openChangePlan(t: Tenant) {
    setEditTenant(t)
    setFormPlan(t.plan)
    setFormPlanStatus(t.planStatus)
    setFormPlanExpiresAt(t.planExpiresAt ? new Date(t.planExpiresAt).toISOString().split('T')[0] : '')
    setShowDialog(true)
  }

  async function handleSavePlan() {
    if (!editTenant) return

    try {
      const body: Record<string, unknown> = {
        id: editTenant.id,
        plan: formPlan,
        planStatus: formPlanStatus,
      }
      if (formPlanExpiresAt) {
        body.planExpiresAt = new Date(formPlanExpiresAt).toISOString()
      } else {
        body.planExpiresAt = null
      }

      const res = await fetch('/api/tenants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); showMsg('err', d.error); return }
      showMsg('ok', `Plan de "${editTenant.name}" actualizado a ${PLAN_CONFIG[formPlan]?.label || formPlan} ✓`)
      setShowDialog(false)
      setEditTenant(null)
      loadData()
    } catch {
      showMsg('err', 'Error de conexión')
    }
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Cargando suscripciones...</div>

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${statusMsg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {statusMsg.type === 'ok' && <CheckCircle className="h-4 w-4" />}
          {statusMsg.text}
        </div>
      )}

      <p className="text-sm text-gray-500">Gestiona los planes de suscripción de cada empresa. Al cambiar el plan se actualizan los límites automáticamente.</p>

      <div className="bg-white rounded-lg border overflow-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-50">
              <th className="p-3 text-left font-semibold border-b">Empresa</th>
              <th className="p-3 text-center font-semibold border-b">Plan</th>
              <th className="p-3 text-center font-semibold border-b">Estado</th>
              <th className="p-3 text-center font-semibold border-b">Expiración</th>
              <th className="p-3 text-center font-semibold border-b">Usuarios</th>
              <th className="p-3 text-center font-semibold border-b">Registros</th>
              <th className="p-3 text-center font-semibold border-b">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map(t => {
              const planCfg = PLAN_CONFIG[t.plan] || PLAN_CONFIG.gratuito
              const isExpired = t.planExpiresAt && new Date(t.planExpiresAt) < new Date()
              return (
                <tr key={t.id} className={`border-b hover:bg-gray-50 ${!t.active ? 'opacity-50' : ''}`}>
                  <td className="p-3 font-bold text-gray-800">{t.name}</td>
                  <td className="p-3 text-center">
                    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${planCfg.color}`}>
                      {planCfg.label}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${
                      isExpired ? 'bg-red-100 text-red-700' :
                      t.planStatus === 'activo' ? 'bg-green-100 text-green-700' :
                      t.planStatus === 'trial' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {isExpired ? 'Expirado' : t.planStatus === 'activo' ? 'Activo' : t.planStatus === 'trial' ? 'Trial' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="p-3 text-center text-gray-500 text-xs">
                    {t.planExpiresAt ? new Date(t.planExpiresAt).toLocaleDateString('es-ES') : '—'}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`text-xs font-bold ${t.userCount >= t.maxUsers && t.maxUsers > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {t.userCount}/{t.maxUsers >= 999 ? '∞' : t.maxUsers}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`text-xs font-bold ${t.registroCount >= t.maxRegistros && t.maxRegistros < 999999 ? 'text-red-600' : 'text-gray-600'}`}>
                      {t.registroCount}/{t.maxRegistros >= 999999 ? '∞' : t.maxRegistros.toLocaleString()}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openChangePlan(t)}>
                      <CreditCard className="h-3.5 w-3.5 mr-1" /> Cambiar Plan
                    </Button>
                  </td>
                </tr>
              )
            })}
            {tenants.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">No hay empresas creadas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Change Plan Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { setShowDialog(false); setEditTenant(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#005bb5]" />
              Cambiar Plan — {editTenant?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Current plan info */}
            {editTenant && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                <p>Plan actual: <strong>{PLAN_CONFIG[editTenant.plan]?.label || editTenant.plan}</strong></p>
                <p>Usuarios: {editTenant.userCount}/{editTenant.maxUsers >= 999 ? '∞' : editTenant.maxUsers} · Registros: {editTenant.registroCount}/{editTenant.maxRegistros >= 999999 ? '∞' : editTenant.maxRegistros.toLocaleString()}</p>
              </div>
            )}

            <div>
              <Label className="text-xs uppercase font-bold text-slate-500">Plan</Label>
              <Select value={formPlan} onValueChange={setFormPlan}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gratuito">Gratuito — 1 usuario, 100 registros</SelectItem>
                  <SelectItem value="mensual">Mensual — 5 usuarios, 5.000 registros</SelectItem>
                  <SelectItem value="trimestral">Trimestral — 15 usuarios, 20.000 registros</SelectItem>
                  <SelectItem value="anual">Anual — usuarios ∞, registros ∞</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Estado del Plan</Label>
                <Select value={formPlanStatus} onValueChange={setFormPlanStatus}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase font-bold text-slate-500">Fecha Expiración</Label>
                <Input
                  type="date"
                  value={formPlanExpiresAt}
                  onChange={e => setFormPlanExpiresAt(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {/* New plan limits preview */}
            {formPlan && PLAN_CONFIG[formPlan] && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 space-y-1">
                <p className="font-bold">Límites del plan {PLAN_CONFIG[formPlan].label}:</p>
                <p>Usuarios: {PLAN_CONFIG[formPlan].maxUsers >= 999 ? 'Ilimitados' : PLAN_CONFIG[formPlan].maxUsers}</p>
                <p>Registros: {PLAN_CONFIG[formPlan].maxRegistros >= 999999 ? 'Ilimitados' : PLAN_CONFIG[formPlan].maxRegistros.toLocaleString()}</p>
                {editTenant && formPlan !== editTenant.plan && (
                  <p className="font-bold text-amber-600 mt-1">⚠ Se actualizarán los límites automáticamente al guardar.</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); setEditTenant(null) }}>Cancelar</Button>
            <Button onClick={handleSavePlan} className="bg-[#2bb24c] hover:bg-[#23963e] text-white">
              <CheckCircle className="h-4 w-4 mr-1" /> GUARDAR PLAN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Admin View (main export) ────────────────────────────────
export function AdminView() {
  return (
    <div className="max-w-5xl pb-8">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-5 w-5 text-[#005bb5]" />
        <h2 className="text-lg font-bold text-gray-700">Administración</h2>
        <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">SUPERADMIN</span>
      </div>

      <Tabs defaultValue="empresas" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="empresas"><Building2 className="h-4 w-4 mr-1.5" /> Empresas</TabsTrigger>
          <TabsTrigger value="usuarios"><Users className="h-4 w-4 mr-1.5" /> Usuarios</TabsTrigger>
          <TabsTrigger value="suscripciones"><CreditCard className="h-4 w-4 mr-1.5" /> Suscripciones</TabsTrigger>
        </TabsList>

        <TabsContent value="empresas" className="mt-4">
          <TenantsTab />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-4">
          <UsersTab />
        </TabsContent>

        <TabsContent value="suscripciones" className="mt-4">
          <SubscriptionsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
