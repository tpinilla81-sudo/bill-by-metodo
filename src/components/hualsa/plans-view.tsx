'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Zap, Clock, TrendingUp, Users, Database, Headphones, CreditCard, AlertTriangle } from 'lucide-react'

interface TenantPlan {
  plan: string
  planStatus: string
  planExpiresAt: string | null
  maxUsers: number
  maxRegistros: number
}

interface PlansViewProps {
  tenantId: string
}

const PLANS = [
  {
    key: 'gratuito',
    name: 'Gratuito',
    price: 'Gratis',
    icon: <Zap className="h-6 w-6" />,
    color: 'border-gray-200',
    headerBg: 'bg-gray-50',
    headerText: 'text-gray-700',
    features: [
      { label: '1 usuario', icon: <Users className="h-4 w-4" /> },
      { label: '100 registros', icon: <Database className="h-4 w-4" /> },
      { label: 'Sin soporte', icon: <Headphones className="h-4 w-4" />, disabled: true },
    ],
  },
  {
    key: 'mensual',
    name: 'Mensual',
    price: 'Consultar',
    icon: <Clock className="h-6 w-6" />,
    color: 'border-blue-200',
    headerBg: 'bg-blue-50',
    headerText: 'text-blue-700',
    popular: true,
    features: [
      { label: '5 usuarios', icon: <Users className="h-4 w-4" /> },
      { label: '5.000 registros', icon: <Database className="h-4 w-4" /> },
      { label: 'Soporte email', icon: <Headphones className="h-4 w-4" /> },
    ],
  },
  {
    key: 'trimestral',
    name: 'Trimestral',
    price: 'Consultar',
    icon: <TrendingUp className="h-6 w-6" />,
    color: 'border-purple-200',
    headerBg: 'bg-purple-50',
    headerText: 'text-purple-700',
    features: [
      { label: '15 usuarios', icon: <Users className="h-4 w-4" /> },
      { label: '20.000 registros', icon: <Database className="h-4 w-4" /> },
      { label: 'Soporte prioritario', icon: <Headphones className="h-4 w-4" /> },
    ],
  },
  {
    key: 'anual',
    name: 'Anual',
    price: 'Consultar',
    icon: <CreditCard className="h-6 w-6" />,
    color: 'border-amber-200',
    headerBg: 'bg-amber-50',
    headerText: 'text-amber-700',
    features: [
      { label: 'Usuarios ilimitados', icon: <Users className="h-4 w-4" /> },
      { label: 'Registros ilimitados', icon: <Database className="h-4 w-4" /> },
      { label: 'Soporte dedicado', icon: <Headphones className="h-4 w-4" /> },
    ],
  },
]

export function PlansView({ tenantId }: PlansViewProps) {
  const [tenant, setTenant] = useState<TenantPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [contactMsg, setContactMsg] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants/mine')
      if (res.ok) {
        const data = await res.json()
        setTenant({
          plan: data.plan,
          planStatus: data.planStatus,
          planExpiresAt: data.planExpiresAt,
          maxUsers: data.maxUsers,
          maxRegistros: data.maxRegistros,
        })
      }
    } catch (err) {
      console.error('Error loading tenant plan:', err)
    }
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData() }, [loadData])

  const currentPlan = PLANS.find(p => p.key === tenant?.plan) || PLANS[0]

  function getPlanStatusBadge() {
    if (!tenant) return null
    const isExpired = tenant.planExpiresAt && new Date(tenant.planExpiresAt) < new Date()
    if (isExpired) return <Badge variant="destructive" className="text-xs">Expirado</Badge>
    if (tenant.planStatus === 'activo') return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Activo</Badge>
    if (tenant.planStatus === 'trial') return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Trial</Badge>
    return <Badge variant="secondary" className="text-xs">Inactivo</Badge>
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Cargando plan...</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      {/* Current Plan Summary */}
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-[#005bb5]" />
        <h2 className="text-lg font-bold text-gray-700">Suscripción</h2>
      </div>

      {tenant && (
        <Card className={`border-2 ${currentPlan.color}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${currentPlan.headerBg} ${currentPlan.headerText}`}>
                  {currentPlan.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-800">Plan {currentPlan.name}</h3>
                    {getPlanStatusBadge()}
                  </div>
                  <p className="text-sm text-gray-500">
                    {tenant.maxUsers >= 999 ? 'Usuarios ilimitados' : `${tenant.maxUsers} usuarios`} · {tenant.maxRegistros >= 999999 ? 'Registros ilimitados' : `${tenant.maxRegistros.toLocaleString()} registros`}
                  </p>
                </div>
              </div>
              {tenant.planExpiresAt && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">Expiración</p>
                  <p className={`text-sm font-bold ${new Date(tenant.planExpiresAt) < new Date() ? 'text-red-600' : 'text-gray-700'}`}>
                    {new Date(tenant.planExpiresAt).toLocaleDateString('es-ES')}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contact banner */}
      {contactMsg && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[#005bb5] mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-blue-700">Contacta con soporte</p>
            <p className="text-sm text-blue-600">Para cambiar tu plan de suscripción, contacta con el administrador de la plataforma en <strong>admin@bill.es</strong>. Te indicarán los precios y realizarán el cambio por ti.</p>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setContactMsg(false)}>✕</Button>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map(plan => {
          const isCurrent = tenant?.plan === plan.key
          return (
            <Card key={plan.key} className={`relative ${isCurrent ? `ring-2 ring-[#2bb24c] ${plan.color}` : plan.color}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full">POPULAR</span>
                </div>
              )}
              <CardHeader className={`${plan.headerBg} rounded-t-lg pb-3`}>
                <div className={`flex items-center gap-2 ${plan.headerText}`}>
                  {plan.icon}
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                </div>
                <div className="mt-1">
                  <span className="text-2xl font-extrabold text-gray-800">{plan.price}</span>
                  {plan.key !== 'gratuito' && <span className="text-xs text-gray-500 ml-1">/periodo</span>}
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <ul className="space-y-2.5">
                  {plan.features.map((feat, i) => (
                    <li key={i} className={`flex items-center gap-2 text-sm ${feat.disabled ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                      <span className={feat.disabled ? 'text-gray-300' : plan.headerText}>{feat.icon}</span>
                      {feat.label}
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      <CheckCircle className="h-4 w-4 mr-1" /> Plan Actual
                    </Button>
                  ) : (
                    <Button
                      className="w-full bg-[#005bb5] hover:bg-[#004a94] text-white"
                      onClick={() => setContactMsg(true)}
                    >
                      {plan.key === 'gratuito' ? 'Downgrade' : 'Contactar'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="text-center text-xs text-gray-400">
        Los precios y cambios de plan son gestionados por el equipo de soporte de BILL by Metodo.
      </p>
    </div>
  )
}
