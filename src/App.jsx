import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
// Local calendar date — never toISOString(), which is UTC and rolls to tomorrow
// after 8pm Eastern (exactly when evening pickups get logged)
function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const COLORS = ['#16a34a','#2563eb','#d97706','#dc2626','#7c3aed','#db2777','#0d9488','#ea580c','#4f46e5','#059669']

// The PIN doubles as the API key: the backend rejects any write without it, so
// unlocking the UI alone is not enough to modify data. The PIN is verified
// server-side (POST /auth/verify) and never baked into this bundle.
let apiPin = localStorage.getItem('gar_pin') || ''
function setApiPin(pin) { apiPin = pin; localStorage.setItem('gar_pin', pin) }
function clearApiPin() { apiPin = ''; localStorage.removeItem('gar_pin') }

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(apiPin ? { 'X-API-Key': apiPin } : {}), ...options.headers },
    ...options,
  })
  if (!res.ok) {
    if (res.status === 401 && options.method && options.method !== 'GET') {
      // Stored PIN no longer valid (rotated server-side) — relock the UI
      clearApiPin()
      window.dispatchEvent(new Event('gar-pin-invalid'))
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const detail = err.detail
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Request failed')
  }
  return res.json()
}

async function verifyPin(pin) {
  const res = await fetch(`${API_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  })
  if (res.ok) return { ok: true }
  const err = await res.json().catch(() => ({ detail: 'Verification failed' }))
  return { ok: false, error: err.detail }
}

function formatMoney(n) { return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatNum(n) { return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) }

// CSV download built from data already on screen — opens straight into Excel
function downloadCsv(filename, headers, rows) {
  const esc = v => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Metric Card ────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-xl shadow p-5 border-l-4" style={{ borderColor: accent || '#16a34a' }}>
      <p className="text-gray-500 text-sm font-medium uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: accent || '#16a34a' }}>{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  )
}

// ─── Sortable Table ─────────────────────────────────────────────────────────
function SortableTable({ columns, data, pageSize = 20 }) {
  const [sortCol, setSortCol] = useState(null)
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (sortCol === null) return data
    return [...data].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol]
      if (typeof av === 'number') return sortAsc ? av - bv : bv - av
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
  }, [data, sortCol, sortAsc])

  const totalPages = Math.ceil(sorted.length / pageSize)
  const rows = sorted.slice(page * pageSize, (page + 1) * pageSize)

  useEffect(() => { setPage(0) }, [data, sortCol, sortAsc])

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-left">
              {columns.map(col => (
                <th key={col.key}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-200 select-none ${col.right ? 'text-right' : ''}`}
                  onClick={() => { if (sortCol === col.key) setSortAsc(!sortAsc); else { setSortCol(col.key); setSortAsc(false) } }}>
                  {col.label} {sortCol === col.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 ${col.right ? 'text-right' : ''} ${col.bold ? 'font-semibold' : ''} ${col.green ? 'text-green-700 font-semibold' : ''}`}>
                    {col.fmt ? col.fmt(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4 text-sm">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}
            className="px-4 py-2 rounded-lg bg-green-600 text-white disabled:bg-gray-300 hover:bg-green-700">Previous</button>
          <span className="text-gray-600">Page {page + 1} of {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}
            className="px-4 py-2 rounded-lg bg-green-600 text-white disabled:bg-gray-300 hover:bg-green-700">Next</button>
        </div>
      )}
    </div>
  )
}

// ─── Overview Tab ───────────────────────────────────────────────────────────
function OverviewTab({ metrics, donorStats, productStats }) {
  const [impact, setImpact] = useState({ servings_per_lb: 2.5, dollars_per_meal: 3 })
  useEffect(() => { api('/settings').then(setImpact).catch(() => {}) }, [])
  if (!metrics) return <p className="p-6 text-gray-500">Loading...</p>
  return (
    <div className="space-y-8 p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Donations" value={metrics.total_donations} accent="#2563eb" />
        <MetricCard label="Total Weight" value={`${formatNum(metrics.total_weight)} lbs`} accent="#16a34a" />
        <MetricCard label="Dollar Value" value={formatMoney(metrics.total_value)} accent="#d97706" />
        <MetricCard label="Active Donors" value={metrics.unique_donors} accent="#7c3aed" />
      </div>

      <div className="bg-green-50 border-2 border-green-600 rounded-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-green-800 mb-6">Community Impact</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="text-5xl font-black text-green-700">{metrics.servings_provided?.toLocaleString()}</div>
            <div className="text-gray-600 mt-2 text-lg">Servings Provided</div>
            <div className="text-gray-400 text-sm">{impact.servings_per_lb} servings per pound</div>
          </div>
          <div>
            <div className="text-5xl font-black text-green-700">{metrics.meals_funded?.toLocaleString()}</div>
            <div className="text-gray-600 mt-2 text-lg">Meals Funded</div>
            <div className="text-gray-400 text-sm">Based on ${impact.dollars_per_meal} per meal</div>
          </div>
          <div>
            <div className="text-5xl font-black text-green-700">{metrics.unique_products}</div>
            <div className="text-gray-600 mt-2 text-lg">Types of Produce</div>
            <div className="text-gray-400 text-sm">Variety of fresh food</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-bold mb-4">Top Donors by Value</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={donorStats.slice(0, 7)} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={v => '$' + v} />
              <YAxis type="category" dataKey="donor_name" width={120} tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => formatMoney(v)} />
              <Bar dataKey="total_value" fill="#16a34a" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-bold mb-4">Top Products by Value</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={productStats.slice(0, 7)} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={v => '$' + v} />
              <YAxis type="category" dataKey="product_name" width={140} tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => formatMoney(v)} />
              <Bar dataKey="total_value" fill="#2563eb" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-lg font-bold mb-4">Product Value Breakdown</h3>
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie data={productStats.slice(0, 8)} dataKey="total_value" nameKey="product_name"
              cx="50%" cy="50%" outerRadius={130} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
              {productStats.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={v => formatMoney(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Donors Tab ─────────────────────────────────────────────────────────────
function DonorsTab({ donorStats, onChanged }) {
  const [allDonors, setAllDonors] = useState([])
  const [showManage, setShowManage] = useState(false)
  const [newDonor, setNewDonor] = useState({ name: '', phone: '', email: '', address: '' })
  const [editingDonor, setEditingDonor] = useState(null)
  const [message, setMessage] = useState(null)

  const loadDonors = useCallback(() => {
    api('/donors?include_inactive=true').then(setAllDonors).catch(() => {})
  }, [])
  useEffect(() => { loadDonors() }, [loadDonors])

  const act = async (fn, successText) => {
    try {
      await fn()
      setMessage({ type: 'success', text: successText })
      loadDonors()
      onChanged()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const handleAdd = (e) => {
    e.preventDefault()
    if (!newDonor.name.trim()) return
    act(async () => {
      await api('/donors', { method: 'POST', body: JSON.stringify({ ...newDonor, name: newDonor.name.trim() }) })
      setNewDonor({ name: '', phone: '', email: '', address: '' })
    }, `Added donor "${newDonor.name.trim()}"`)
  }

  const handleSaveEdit = () => {
    const d = editingDonor
    act(async () => {
      await api(`/donors/${d.id}`, { method: 'PUT', body: JSON.stringify({ name: d.name.trim(), phone: d.phone || null, email: d.email || null, address: d.address || null }) })
      setEditingDonor(null)
    }, `Updated "${d.name.trim()}"`)
  }

  const cols = [
    { key: 'donor_name', label: 'Donor', bold: true },
    { key: 'total_value', label: 'Total Value', right: true, green: true, fmt: v => formatMoney(v) },
    { key: 'total_weight', label: 'Weight (lbs)', right: true, fmt: v => formatNum(v) },
    { key: 'total_donations', label: '# Donations', right: true },
    { key: 'unique_products', label: '# Products', right: true },
    { key: 'avg', label: 'Avg/Donation', right: true, fmt: (_, row) => formatMoney(row.total_value / row.total_donations) },
  ]
  return (
    <div className="p-6 space-y-6">
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{message.text}</div>
      )}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="bg-green-600 text-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">All Donors ({donorStats.length})</h2>
          <button onClick={() => setShowManage(!showManage)}
            className="px-4 py-1.5 bg-white text-green-700 rounded-lg text-sm font-semibold hover:bg-green-50">
            {showManage ? 'Hide Donor List' : 'Manage Donor List'}
          </button>
        </div>
        <SortableTable columns={cols} data={donorStats} pageSize={50} />
      </div>

      {showManage && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="bg-gray-700 text-white px-6 py-4"><h2 className="text-xl font-bold">Donor List ({allDonors.length})</h2></div>
          <div className="p-4 border-b bg-gray-50">
            <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
              <input type="text" placeholder="Full name or organization *" value={newDonor.name}
                onChange={e => setNewDonor({ ...newDonor, name: e.target.value })}
                className="flex-1 px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
              <input type="text" placeholder="Phone (optional)" value={newDonor.phone}
                onChange={e => setNewDonor({ ...newDonor, phone: e.target.value })}
                className="w-40 px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
              <input type="email" placeholder="Email (optional)" value={newDonor.email}
                onChange={e => setNewDonor({ ...newDonor, email: e.target.value })}
                className="w-48 px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
              <input type="text" placeholder="Address (optional)" value={newDonor.address}
                onChange={e => setNewDonor({ ...newDonor, address: e.target.value })}
                className="flex-1 px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
              <button type="submit" className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">Add Donor</button>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allDonors.map(d => {
                  const isEditing = editingDonor?.id === d.id
                  return (
                    <tr key={d.id} className={`border-b hover:bg-gray-50 ${!d.active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2 font-semibold">
                        {isEditing ? <input value={editingDonor.name} onChange={e => setEditingDonor({ ...editingDonor, name: e.target.value })}
                          className="w-full px-2 py-1 border-2 border-amber-400 rounded outline-none" autoFocus /> : d.name}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {isEditing ? <input value={editingDonor.phone || ''} onChange={e => setEditingDonor({ ...editingDonor, phone: e.target.value })}
                          className="w-full px-2 py-1 border-2 border-amber-400 rounded outline-none" /> : (d.phone || '—')}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {isEditing ? <input type="email" value={editingDonor.email || ''} onChange={e => setEditingDonor({ ...editingDonor, email: e.target.value })}
                          className="w-full px-2 py-1 border-2 border-amber-400 rounded outline-none" /> : (d.email || '—')}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {isEditing ? <input value={editingDonor.address || ''} onChange={e => setEditingDonor({ ...editingDonor, address: e.target.value })}
                          className="w-full px-2 py-1 border-2 border-amber-400 rounded outline-none" /> : (d.address || '—')}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full ${d.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                          {d.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {isEditing ? (
                          <div className="flex gap-1 justify-center">
                            <button onClick={handleSaveEdit} className="px-3 py-2 bg-green-600 text-white rounded text-xs hover:bg-green-700">Save</button>
                            <button onClick={() => setEditingDonor(null)} className="px-3 py-2 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => setEditingDonor({ ...d })}
                              className="px-3 py-2 bg-amber-100 text-amber-700 rounded text-xs hover:bg-amber-200 font-semibold">Edit</button>
                            {d.active ? (
                              <button onClick={() => act(() => api(`/donors/${d.id}/deactivate`, { method: 'POST' }), `Deactivated "${d.name}" — past donations are kept`)}
                                className="px-3 py-2 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 font-semibold">Deactivate</button>
                            ) : (
                              <button onClick={() => act(() => api(`/donors/${d.id}/reactivate`, { method: 'POST' }), `Reactivated "${d.name}"`)}
                                className="px-3 py-2 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 font-semibold">Reactivate</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 bg-gray-50 text-gray-500 text-xs border-t">
            Deactivated donors disappear from the entry dropdown but keep all their donation history in reports.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Products Tab ───────────────────────────────────────────────────────────
function ProductsTab({ productStats }) {
  const cols = [
    { key: 'product_name', label: 'Product', bold: true },
    { key: 'total_value', label: 'Total Value', right: true, green: true, fmt: v => formatMoney(v) },
    { key: 'total_weight', label: 'Weight (lbs)', right: true, fmt: v => formatNum(v) },
    { key: 'total_donations', label: '# Donations', right: true },
    { key: 'unique_donors', label: '# Donors', right: true },
    { key: 'avg_wt', label: 'Avg Weight', right: true, fmt: (_, row) => formatNum(row.total_weight / row.total_donations) + ' lbs' },
  ]
  return (
    <div className="p-6">
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="bg-blue-600 text-white px-6 py-4"><h2 className="text-xl font-bold">All Products ({productStats.length})</h2></div>
        <SortableTable columns={cols} data={productStats} pageSize={50} />
      </div>
    </div>
  )
}

// ─── Trends Tab ─────────────────────────────────────────────────────────────
function TrendsTab({ donations }) {
  const weeklyData = useMemo(() => {
    const weeks = {}
    donations.forEach(d => {
      // parse at noon so the calendar date survives the local-timezone shift
      const dt = new Date(d.donation_date + 'T12:00:00')
      const sun = new Date(dt); sun.setDate(dt.getDate() - dt.getDay())
      const key = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`
      if (!weeks[key]) weeks[key] = { week: key, donations: 0, weight: 0, value: 0 }
      weeks[key].donations++
      weeks[key].weight += d.weight
      weeks[key].value += d.total_value
    })
    return Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)).map(w => ({
      ...w,
      weight: +w.weight.toFixed(2),
      value: +w.value.toFixed(2),
      label: new Date(w.week + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }))
  }, [donations])

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-bold mb-4">Weekly Donation Value & Weight</h2>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis yAxisId="left" tickFormatter={v => '$' + v} />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip formatter={(v, name) => name.includes('Value') ? formatMoney(v) : formatNum(v) + ' lbs'} />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="value" name="Dollar Value" stroke="#16a34a" strokeWidth={3} dot={{ r: 4 }} />
            <Line yAxisId="right" type="monotone" dataKey="weight" name="Weight (lbs)" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-bold mb-4">Weekly Donations Count</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="donations" name="# Donations" fill="#7c3aed" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── All Donations Tab ──────────────────────────────────────────────────────
function EditDonationModal({ donation, products, donors, onClose, onSaved }) {
  const [form, setForm] = useState({
    donor_name: donation.donor_name,
    product_name: donation.product_name,
    weight: String(donation.weight),
    item_count: donation.item_count != null ? String(donation.item_count) : '',
    donation_date: donation.donation_date,
    notes: donation.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await api(`/donations/${donation.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          weight: parseFloat(form.weight),
          item_count: form.item_count ? parseInt(form.item_count) : null,
        }),
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-4 text-gray-800">Edit Donation #{donation.id}</h3>
        {error && <div className="mb-3 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Donor</label>
            <select value={form.donor_name} onChange={e => setForm({ ...form, donor_name: e.target.value })}
              className="w-full px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500 bg-white">
              {!donors.some(d => d.name === form.donor_name) && <option value={form.donor_name}>{form.donor_name}</option>}
              {donors.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Product</label>
            <select value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })}
              className="w-full px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500 bg-white">
              {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Weight (lbs)</label>
              <input type="number" step="0.1" min="0" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })}
                className="w-full px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1"># Items</label>
              <input type="number" step="1" min="0" value={form.item_count} onChange={e => setForm({ ...form, item_count: e.target.value })}
                className="w-full px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" placeholder="—" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
              <input type="date" value={form.donation_date} onChange={e => setForm({ ...form, donation_date: e.target.value })}
                className="w-full px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows="2"
              className="w-full px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
          </div>
          <p className="text-xs text-gray-400">Value is recalculated from the price in effect on the donation date.</p>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300">Cancel</button>
        </div>
      </div>
    </div>
  )
}

function DonationsTab({ donations, products, donors, onChanged }) {
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState(null)

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete this donation?\n\n${row.donation_date}: ${row.weight} lbs of ${row.product_name} from ${row.donor_name}`)) return
    try {
      await api(`/donations/${row.id}`, { method: 'DELETE' })
      setMessage({ type: 'success', text: 'Donation deleted.' })
      onChanged()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const cols = [
    { key: 'donation_date', label: 'Date', fmt: v => new Date(v + 'T12:00:00').toLocaleDateString() },
    { key: 'donor_name', label: 'Donor', bold: true },
    { key: 'product_name', label: 'Product' },
    { key: 'item_count', label: '# Items', right: true, fmt: v => v ?? '—' },
    { key: 'weight', label: 'Weight (lbs)', right: true, fmt: v => formatNum(v) },
    { key: 'price_per_lb', label: 'Price/lb', right: true, fmt: v => formatMoney(v) },
    { key: 'total_value', label: 'Value', right: true, green: true, fmt: v => formatMoney(v) },
    { key: 'id', label: 'Actions', right: true, fmt: (_, row) => (
      <div className="flex gap-1 justify-end">
        <button onClick={() => setEditing(row)}
          className="px-3 py-2 bg-amber-100 text-amber-700 rounded text-xs hover:bg-amber-200 font-semibold">Edit</button>
        <button onClick={() => handleDelete(row)}
          className="px-3 py-2 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 font-semibold">Delete</button>
      </div>
    ) },
  ]
  return (
    <div className="p-6">
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{message.text}</div>
      )}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="bg-gray-700 text-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">All Donations ({donations.length})</h2>
          <button onClick={() => downloadCsv(`GrowARow_donations_${localToday()}.csv`,
            ['Date', 'Donor', 'Product', 'Items', 'Weight (lbs)', 'Price/lb', 'Value', 'Notes'],
            donations.map(d => [d.donation_date, d.donor_name, d.product_name, d.item_count ?? '', d.weight, d.price_per_lb, d.total_value, d.notes ?? '']))}
            className="px-4 py-1.5 bg-white text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-100">⬇ CSV</button>
        </div>
        <SortableTable columns={cols} data={donations} pageSize={25} />
      </div>
      {editing && (
        <EditDonationModal donation={editing} products={products} donors={donors}
          onClose={() => setEditing(null)} onSaved={() => { setMessage({ type: 'success', text: 'Donation updated.' }); onChanged() }} />
      )}
    </div>
  )
}

// ─── Bulk Entry ─────────────────────────────────────────────────────────────
// For transcribing a photographed paper sheet after a pickup day: one line per
// donation, previewed and validated before anything is saved (all-or-nothing).
function BulkEntry({ products, donors, onDone }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [bulkDate, setBulkDate] = useState(localToday())
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  const productLookup = useMemo(() => {
    const m = {}
    products.forEach(p => { m[p.name.toLowerCase()] = p.name })
    return m
  }, [products])
  const donorLookup = useMemo(() => {
    const m = {}
    donors.forEach(d => { m[d.name.toLowerCase()] = d.name })
    return m
  }, [donors])

  const parsed = useMemo(() => {
    return text.split('\n').map(l => l.trim()).filter(Boolean).map((line, i) => {
      const parts = line.split(',').map(p => p.trim())
      if (parts.length < 3) return { line: i + 1, raw: line, error: 'Need: Donor, Product, Weight' }
      const [donorRaw, productRaw, weightRaw, itemsRaw] = parts
      const product = productLookup[productRaw.toLowerCase()]
      if (!product) return { line: i + 1, raw: line, error: `Unknown product "${productRaw}"` }
      const weight = parseFloat(weightRaw)
      if (!(weight > 0)) return { line: i + 1, raw: line, error: `Bad weight "${weightRaw}"` }
      const items = itemsRaw ? parseInt(itemsRaw) : null
      const donor = donorLookup[donorRaw.toLowerCase()] || donorRaw
      return { line: i + 1, donor, product, weight, items, newDonor: !donorLookup[donorRaw.toLowerCase()] }
    })
  }, [text, productLookup, donorLookup])

  const errors = parsed.filter(p => p.error)
  const valid = parsed.filter(p => !p.error)

  const handleSubmit = async () => {
    if (errors.length || valid.length === 0) return
    setSaving(true)
    setResult(null)
    try {
      const res = await api('/donations/bulk', {
        method: 'POST',
        body: JSON.stringify({
          donations: valid.map(p => ({
            donor_name: p.donor, product_name: p.product, weight: p.weight,
            item_count: p.items, donation_date: bulkDate,
          })),
        }),
      })
      setResult({ type: 'success', text: `Saved all ${res.saved} donations for ${bulkDate}.` })
      setText('')
      onDone()
    } catch (err) {
      setResult({ type: 'error', text: `${err.message} (nothing was saved)` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow mt-6 p-6">
      <button onClick={() => setOpen(!open)} className="text-sm font-semibold text-blue-600 hover:text-blue-800">
        {open ? '▾' : '▸'} Bulk Entry — type in a paper sheet
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-gray-500">
            One donation per line: <code className="bg-gray-100 px-1 rounded">Donor, Product, Weight, Items</code> (items optional).
            Nothing is saved until every line checks out.
          </p>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-600">Sheet date:</label>
            <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)}
              className="px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
          </div>
          <textarea value={text} onChange={e => { setText(e.target.value); setResult(null) }} rows="6"
            placeholder={"Cindy Gist, Tomatoes - Slicing, 4.5, 6\nBrooks Automation, Zucchini, 12"}
            className="w-full px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500 font-mono text-sm" />
          {result && (
            <div className={`p-3 rounded-lg text-sm ${result.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{result.text}</div>
          )}
          {text.trim() && (
            <div className="text-sm space-y-1">
              {errors.map(e => (
                <div key={e.line} className="text-red-600">Line {e.line}: {e.error} — <span className="font-mono text-xs">{e.raw}</span></div>
              ))}
              {valid.length > 0 && (
                <div className="text-gray-600">
                  ✓ {valid.length} line{valid.length > 1 ? 's' : ''} ready
                  {valid.some(v => v.newDonor) && <span className="text-amber-600"> · new donors will be created: {[...new Set(valid.filter(v => v.newDonor).map(v => v.donor))].join(', ')}</span>}
                </div>
              )}
            </div>
          )}
          <button onClick={handleSubmit} disabled={saving || errors.length > 0 || valid.length === 0}
            className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 font-semibold">
            {saving ? 'Saving...' : `Save ${valid.length || ''} Donation${valid.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Add Donation Tab ───────────────────────────────────────────────────────
const DRAFT_KEY = 'gar_entry_draft'

function AddDonationTab({ products, donors, onAdded }) {
  const [form, setForm] = useState(() => {
    // Restore an unsaved draft (survives a dropped signal, closed tab, or crash)
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY))
      if (draft && (draft.donor_name || draft.product_name || draft.weight)) return { ...draft, donation_date: draft.donation_date || localToday() }
    } catch { /* fall through */ }
    return { donor_name: '', product_name: '', weight: '', item_count: '', donation_date: localToday(), notes: '' }
  })
  const [newDonorMode, setNewDonorMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [priceMap, setPriceMap] = useState({})
  const [dayEntries, setDayEntries] = useState([])

  // Draft persistence: anything typed survives until successfully saved
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)) } catch { /* storage full */ }
  }, [form])

  // "Entered so far" for the form's date — confirmation + undo without leaving the screen
  const loadDayEntries = useCallback(() => {
    if (!form.donation_date) return
    api(`/donations?start_date=${form.donation_date}&end_date=${form.donation_date}`)
      .then(d => setDayEntries(d.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))))
      .catch(() => {})
  }, [form.donation_date])
  useEffect(() => { loadDayEntries() }, [loadDayEntries])

  const handleUndo = async (entry) => {
    if (!window.confirm(`Remove ${entry.weight} lbs of ${entry.product_name} from ${entry.donor_name}?`)) return
    try {
      await api(`/donations/${entry.id}`, { method: 'DELETE' })
      setMessage({ type: 'success', text: 'Entry removed.' })
      loadDayEntries()
      onAdded()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const isStaleDate = form.donation_date && form.donation_date !== localToday()
  const dayTotal = dayEntries.reduce((s, d) => s + d.total_value, 0)
  const dayWeight = dayEntries.reduce((s, d) => s + d.weight, 0)

  // Prices are effective-dated: load the price of every product as of the donation date
  useEffect(() => {
    if (!form.donation_date) return
    api(`/product-prices/for-date/${form.donation_date}`)
      .then(prices => {
        const map = {}
        prices.forEach(p => { map[p.product_name] = p.effective_price })
        setPriceMap(map)
      })
      .catch(() => {})
  }, [form.donation_date])

  const selectedProduct = products.find(p => p.name === form.product_name)
  const effectivePrice = priceMap[form.product_name] || (selectedProduct ? selectedProduct.price_per_lb : null)
  const calcValue = effectivePrice && form.weight ? (parseFloat(form.weight) * effectivePrice).toFixed(2) : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.donor_name.trim() || !form.product_name || !form.weight) {
      setMessage({ type: 'error', text: 'Please fill in all required fields.' })
      return
    }
    const w = parseFloat(form.weight)
    if (!(w > 0)) {
      setMessage({ type: 'error', text: 'Weight must be greater than zero.' })
      return
    }
    if (w > 100 && !window.confirm(`That's ${w} lbs of ${form.product_name} — unusually large. Save anyway?`)) return
    // Duplicate guard: same donor + product + weight already saved for this date
    const dup = dayEntries.find(d => d.donor_name === form.donor_name.trim() && d.product_name === form.product_name && Math.abs(d.weight - w) < 0.001)
    if (dup && !window.confirm(`${dup.donor_name} already has ${dup.weight} lbs of ${dup.product_name} recorded for this date. Save a second entry anyway?`)) return
    setSaving(true)
    setMessage(null)
    try {
      await api('/donations', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          donor_name: form.donor_name.trim(),
          weight: parseFloat(form.weight),
          item_count: form.item_count ? parseInt(form.item_count) : null,
        }),
      })
      setMessage({ type: 'success', text: `Donation recorded! ${form.weight} lbs of ${form.product_name} from ${form.donor_name} (${formatMoney(calcValue)})` })
      setForm({ donor_name: '', product_name: '', weight: '', item_count: '', donation_date: form.donation_date, notes: '' })
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
      setNewDonorMode(false)
      loadDayEntries()
      onAdded()
    } catch (err) {
      setMessage({ type: 'error', text: `${err.message} — your entry is still in the form; check signal and tap Record again.` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="bg-white rounded-xl shadow p-8">
        <h2 className="text-2xl font-bold mb-6 text-green-700">Record New Donation</h2>
        {message && (
          <div className={`mb-4 p-4 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </div>
        )}
        {isStaleDate && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 border-2 border-amber-300 text-sm font-semibold flex items-center justify-between gap-2">
            <span>⚠️ Recording for {new Date(form.donation_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} — not today</span>
            <button type="button" onClick={() => setForm({ ...form, donation_date: localToday() })}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 whitespace-nowrap">Use Today</button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Donor *</label>
            {newDonorMode ? (
              <div className="flex gap-2">
                <input type="text" value={form.donor_name}
                  onChange={e => setForm({ ...form, donor_name: e.target.value })}
                  className="flex-1 px-4 py-3 border-2 border-green-400 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  placeholder="New donor name or organization" autoFocus />
                <button type="button" onClick={() => { setNewDonorMode(false); setForm({ ...form, donor_name: '' }) }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">Cancel</button>
              </div>
            ) : (
              <select value={form.donor_name}
                onChange={e => {
                  if (e.target.value === '__new__') { setNewDonorMode(true); setForm({ ...form, donor_name: '' }) }
                  else setForm({ ...form, donor_name: e.target.value })
                }}
                className="w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white">
                <option value="">Select donor...</option>
                {donors.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                <option value="__new__">➕ Add a new donor...</option>
              </select>
            )}
            {newDonorMode && <p className="text-xs text-green-600 mt-1">The new donor is saved automatically with this donation.</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Product *</label>
            <select value={form.product_name}
              onChange={e => setForm({ ...form, product_name: e.target.value })}
              className="w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white">
              <option value="">Select produce type...</option>
              {products.map(p => {
                const price = priceMap[p.name] || p.price_per_lb
                return <option key={p.id} value={p.name}>{p.name} — {formatMoney(price)}/lb</option>
              })}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Weight (lbs) *</label>
              <input type="number" step="0.1" min="0" inputMode="decimal" value={form.weight}
                onChange={e => setForm({ ...form, weight: e.target.value })}
                className="w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                placeholder="0.0" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1"># of Items</label>
              <input type="number" step="1" min="0" value={form.item_count}
                onChange={e => setForm({ ...form, item_count: e.target.value })}
                className="w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                placeholder="optional" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Date *</label>
            <input type="date" value={form.donation_date}
              onChange={e => setForm({ ...form, donation_date: e.target.value })}
              className="w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none" />
            <p className="text-xs text-gray-400 mt-1">Value uses the price in effect on this date</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Notes (optional)</label>
            <textarea value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              rows="2" placeholder="Any additional notes..." />
          </div>

          {calcValue && (
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
              <div className="flex justify-between"><span>Price per pound:</span><span className="font-semibold">{formatMoney(effectivePrice)}</span></div>
              <div className="flex justify-between mt-2 text-xl"><span className="font-bold">Calculated Value:</span><span className="font-black text-green-700">{formatMoney(calcValue)}</span></div>
            </div>
          )}

          <button type="submit" disabled={saving}
            className="w-full py-4 rounded-lg font-bold text-lg text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 transition-colors">
            {saving ? 'Saving...' : 'Record Donation'}
          </button>
        </form>
      </div>

      {/* Entered so far — confirmation and undo without leaving the screen */}
      {dayEntries.length > 0 && (
        <div className="bg-white rounded-xl shadow mt-6 overflow-hidden">
          <div className="bg-green-700 text-white px-6 py-3 flex items-center justify-between">
            <h3 className="font-bold">
              {isStaleDate ? `Entered for ${new Date(form.donation_date + 'T12:00:00').toLocaleDateString()}` : 'Entered today'} ({dayEntries.length})
            </h3>
            <span className="text-green-100 text-sm font-semibold">{formatNum(dayWeight)} lbs · {formatMoney(dayTotal)}</span>
          </div>
          <ul className="divide-y">
            {dayEntries.map(d => (
              <li key={d.id} className="px-4 py-3 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold">{d.donor_name}</span>
                  <span className="text-gray-500"> — {d.product_name}, {formatNum(d.weight)} lbs{d.item_count ? ` (${d.item_count} items)` : ''}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-green-700 font-semibold">{formatMoney(d.total_value)}</span>
                  <button onClick={() => handleUndo(d)}
                    className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 min-h-[40px]">Undo</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <BulkEntry products={products} donors={donors} onDone={() => { loadDayEntries(); onAdded() }} />
    </div>
  )
}

// ─── Manage Products Tab ────────────────────────────────────────────────────
function ManageProductsTab({ products, onUpdated, seasons }) {
  const [newProduct, setNewProduct] = useState({ name: '', price_per_lb: '', category: 'Vegetable' })
  const [message, setMessage] = useState(null)
  const [priceYear, setPriceYear] = useState(new Date().getFullYear())
  const [seasonPrices, setSeasonPrices] = useState([])
  const [editingPrices, setEditingPrices] = useState({})
  const [priceYears, setPriceYears] = useState([])
  const [initYear, setInitYear] = useState(new Date().getFullYear())

  // Load available price years and season prices
  const loadPrices = useCallback(async () => {
    try {
      const [years, prices] = await Promise.all([
        api('/product-prices/years'),
        api(`/product-prices/for-year/${priceYear}`)
      ])
      setPriceYears(years)
      setSeasonPrices(prices)
      setEditingPrices({})
    } catch (err) {
      console.error('Failed to load prices', err)
    }
  }, [priceYear])

  useEffect(() => { loadPrices() }, [loadPrices])

  // Product list management (rename / deactivate) — includes retired products
  const [allProducts, setAllProducts] = useState([])
  const [showList, setShowList] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const loadAllProducts = useCallback(() => {
    api('/products?include_inactive=true').then(setAllProducts).catch(() => {})
  }, [])
  useEffect(() => { loadAllProducts() }, [loadAllProducts])

  const productAct = async (fn, successText) => {
    try {
      await fn()
      setMessage({ type: 'success', text: successText })
      loadAllProducts()
      loadPrices()
      onUpdated()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const handleSaveProductEdit = () => {
    const p = editingProduct
    productAct(async () => {
      await api(`/products/${p.id}`, { method: 'PUT', body: JSON.stringify({ name: p.name.trim(), category: p.category }) })
      setEditingProduct(null)
    }, `Updated "${p.name.trim()}" — donation history follows the new name`)
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newProduct.name || !newProduct.price_per_lb) return
    try {
      await api('/products', {
        method: 'POST',
        body: JSON.stringify({ ...newProduct, price_per_lb: parseFloat(newProduct.price_per_lb) }),
      })
      setMessage({ type: 'success', text: `Added "${newProduct.name}" at ${formatMoney(newProduct.price_per_lb)}/lb` })
      setNewProduct({ name: '', price_per_lb: '', category: 'Vegetable' })
      onUpdated()
      loadPrices()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const handlePriceEdit = (productName, newPrice) => {
    setEditingPrices(prev => ({ ...prev, [productName]: newPrice }))
  }

  const handleSavePrice = async (productName) => {
    const newPrice = parseFloat(editingPrices[productName])
    if (isNaN(newPrice) || newPrice <= 0) return
    try {
      await api('/product-prices', {
        method: 'POST',
        body: JSON.stringify({ product_name: productName, year: priceYear, price_per_lb: newPrice, source: 'manual' })
      })
      setMessage({ type: 'success', text: `Updated ${productName} to ${formatMoney(newPrice)}/lb for ${priceYear}` })
      setEditingPrices(prev => { const n = { ...prev }; delete n[productName]; return n })
      loadPrices()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const handleInitSeason = async () => {
    try {
      const prevYear = priceYears.length > 0 ? Math.max(...priceYears.filter(y => y < initYear)) : null
      const url = `/product-prices/initialize-season/${initYear}` + (prevYear ? `?source_year=${prevYear}` : '')
      const result = await api(url, { method: 'POST' })
      if (result.status === 'skipped') {
        setMessage({ type: 'error', text: result.message })
      } else {
        setMessage({ type: 'success', text: `Initialized ${initYear} season with ${result.products_initialized} product prices!` })
        setPriceYear(initYear)
        loadPrices()
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const handleSaveAllEdited = async () => {
    const prices = Object.entries(editingPrices).map(([name, price]) => ({
      product_name: name, year: priceYear, price_per_lb: parseFloat(price), source: 'manual'
    })).filter(p => !isNaN(p.price_per_lb) && p.price_per_lb > 0)

    if (prices.length === 0) return
    try {
      await api('/product-prices/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ year: priceYear, prices })
      })
      setMessage({ type: 'success', text: `Updated ${prices.length} prices for ${priceYear} season` })
      setEditingPrices({})
      loadPrices()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const editCount = Object.keys(editingPrices).length

  return (
    <div className="p-6 space-y-6">
      {message && (
        <div className={`p-4 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{message.text}</div>
      )}

      {/* Add New Product */}
      <div className="bg-white rounded-xl shadow p-6 max-w-lg mx-auto">
        <h3 className="text-lg font-bold mb-4">Add New Product</h3>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <input type="text" placeholder="Product name" value={newProduct.name}
            onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
            className="flex-1 px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
          <input type="number" step="0.01" placeholder="$/lb" value={newProduct.price_per_lb}
            onChange={e => setNewProduct({ ...newProduct, price_per_lb: e.target.value })}
            className="w-28 px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
          <select value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
            className="px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500 bg-white">
            <option>Vegetable</option><option>Fruit</option><option>Herbs</option>
          </select>
          <button type="submit" className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">Add</button>
        </form>
        <div className="mt-3 text-right">
          <button onClick={() => setShowList(!showList)} className="text-sm font-semibold text-blue-600 hover:text-blue-800">
            {showList ? '▾' : '▸'} Rename or Retire Products ({allProducts.length})
          </button>
        </div>
      </div>

      {/* Product List Management */}
      {showList && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="bg-gray-700 text-white px-6 py-4"><h2 className="text-xl font-bold">Product List ({allProducts.length})</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allProducts.map(p => {
                  const isEditing = editingProduct?.id === p.id
                  return (
                    <tr key={p.id} className={`border-b hover:bg-gray-50 ${p.active === false ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2 font-semibold">
                        {isEditing ? <input value={editingProduct.name} onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                          className="w-full px-2 py-1 border-2 border-amber-400 rounded outline-none" autoFocus /> : p.name}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {isEditing ? (
                          <select value={editingProduct.category || 'Vegetable'} onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })}
                            className="px-2 py-1 border-2 border-amber-400 rounded outline-none bg-white">
                            <option>Vegetable</option><option>Fruit</option><option>Herbs</option>
                          </select>
                        ) : (p.category || '—')}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full ${p.active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                          {p.active !== false ? 'Active' : 'Retired'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {isEditing ? (
                          <div className="flex gap-1 justify-center">
                            <button onClick={handleSaveProductEdit} className="px-3 py-2 bg-green-600 text-white rounded text-xs hover:bg-green-700">Save</button>
                            <button onClick={() => setEditingProduct(null)} className="px-3 py-2 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => setEditingProduct({ ...p })}
                              className="px-3 py-2 bg-amber-100 text-amber-700 rounded text-xs hover:bg-amber-200 font-semibold">Rename</button>
                            {p.active !== false ? (
                              <button onClick={() => productAct(() => api(`/products/${p.id}/deactivate`, { method: 'POST' }), `Retired "${p.name}" — history is kept, hidden from entry forms`)}
                                className="px-3 py-2 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 font-semibold">Retire</button>
                            ) : (
                              <button onClick={() => productAct(() => api(`/products/${p.id}/reactivate`, { method: 'POST' }), `Restored "${p.name}"`)}
                                className="px-3 py-2 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 font-semibold">Restore</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 bg-gray-50 text-gray-500 text-xs border-t">
            Renaming a product updates its entire donation history to the new name. Retiring hides it from entry forms but keeps all past donations and reports intact.
          </div>
        </div>
      )}

      {/* Impact Settings */}
      <ImpactSettings onSaved={() => setMessage({ type: 'success', text: 'Impact settings saved — dashboard numbers update immediately.' })} onError={err => setMessage({ type: 'error', text: err })} />

      {/* Initialize New Season */}
      <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-6">
        <h3 className="text-lg font-bold mb-2 text-blue-800">Start a New Season</h3>
        <p className="text-blue-600 text-sm mb-4">Copy prices from the previous season as a starting point, then adjust as needed.</p>
        <div className="flex items-center gap-3">
          <input type="number" value={initYear}
            onChange={e => setInitYear(parseInt(e.target.value))}
            className="w-24 px-3 py-2 border-2 rounded-lg outline-none focus:border-blue-500" />
          <button onClick={handleInitSeason}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
            Initialize {initYear} Season Prices
          </button>
        </div>
      </div>

      {/* Season Price Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="bg-amber-600 text-white px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-xl font-bold">Season Pricing ({seasonPrices.length} products)</h2>
          <div className="flex items-center gap-3">
            <span className="text-amber-100 text-sm font-medium">Viewing:</span>
            <select value={priceYear}
              onChange={e => setPriceYear(parseInt(e.target.value))}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-800 bg-white">
              {[...new Set([...priceYears, new Date().getFullYear()])].sort((a, b) => b - a).map(y => (
                <option key={y} value={y}>{y} Season</option>
              ))}
            </select>
            {editCount > 0 && (
              <button onClick={handleSaveAllEdited}
                className="px-4 py-1.5 bg-green-500 text-white rounded-lg font-semibold text-sm hover:bg-green-600">
                Save {editCount} Change{editCount > 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Default Price</th>
                <th className="px-4 py-3 text-right">{priceYear} Price</th>
                <th className="px-4 py-3 text-center">Source</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {seasonPrices.map(p => {
                const isEditing = editingPrices[p.product_name] !== undefined
                return (
                  <tr key={p.product_name} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold">{p.product_name}</td>
                    <td className="px-4 py-3 text-gray-500">{p.category}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{formatMoney(p.default_price)}</td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input type="number" step="0.01" value={editingPrices[p.product_name]}
                          onChange={e => handlePriceEdit(p.product_name, e.target.value)}
                          className="w-24 px-2 py-1 border-2 border-amber-400 rounded text-right outline-none focus:border-amber-600"
                          autoFocus />
                      ) : (
                        <span className={`font-semibold ${p.has_season_price ? 'text-green-700' : 'text-gray-400 italic'}`}>
                          {formatMoney(p.effective_price)}
                          {!p.has_season_price && ' *'}
                          {p.effective_date && !p.effective_date.endsWith('-01-01') && (
                            <span className="block text-xs text-amber-600 font-normal">since {new Date(p.effective_date + 'T12:00:00').toLocaleDateString()}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        p.source === 'default' ? 'bg-gray-100 text-gray-500' :
                        p.source === 'manual' ? 'bg-green-100 text-green-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{p.source}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => handleSavePrice(p.product_name)}
                            className="px-3 py-2 bg-green-600 text-white rounded text-xs hover:bg-green-700">Save</button>
                          <button onClick={() => setEditingPrices(prev => { const n = { ...prev }; delete n[p.product_name]; return n })}
                            className="px-3 py-2 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => handlePriceEdit(p.product_name, p.effective_price.toString())}
                          className="px-3 py-2 bg-amber-100 text-amber-700 rounded text-xs hover:bg-amber-200 font-semibold">Edit</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 bg-gray-50 text-gray-500 text-xs border-t space-y-1">
          {seasonPrices.some(p => !p.has_season_price) && (
            <p>* Using default price — no season-specific price set for {priceYear}</p>
          )}
          <p>Changing a price mid-season applies <strong>from today forward</strong> — donations already recorded keep the price that was in effect on their date.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Impact Settings ────────────────────────────────────────────────────────
// The multipliers behind "Servings Provided" and "Meals Funded" — editable so a
// grant-year change doesn't need a developer
function ImpactSettings({ onSaved, onError }) {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api('/settings').then(s => setSettings({ servings_per_lb: String(s.servings_per_lb), dollars_per_meal: String(s.dollars_per_meal) })).catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          servings_per_lb: parseFloat(settings.servings_per_lb),
          dollars_per_meal: parseFloat(settings.dollars_per_meal),
        }),
      })
      onSaved()
    } catch (err) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return null
  return (
    <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-6">
      <h3 className="text-lg font-bold mb-2 text-purple-800">Impact Settings</h3>
      <p className="text-purple-600 text-sm mb-4">These drive the "Servings Provided" and "Meals Funded" numbers on the dashboard and reports.</p>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Servings per pound</label>
          <input type="number" step="0.1" min="0.1" inputMode="decimal" value={settings.servings_per_lb}
            onChange={e => setSettings({ ...settings, servings_per_lb: e.target.value })}
            className="w-32 px-3 py-2 border-2 rounded-lg outline-none focus:border-purple-500" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Dollars per meal</label>
          <input type="number" step="0.25" min="0.25" inputMode="decimal" value={settings.dollars_per_meal}
            onChange={e => setSettings({ ...settings, dollars_per_meal: e.target.value })}
            className="w-32 px-3 py-2 border-2 rounded-lg outline-none focus:border-purple-500" />
        </div>
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 font-semibold">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ─── Year-Over-Year Tab ─────────────────────────────────────────────────────
function YearOverYearTab({ seasons, yoyData }) {
  // hooks must run unconditionally — the empty-state return comes after them
  const chartData = useMemo(() => {
    if (!yoyData) return []
    const allWeeks = new Set()
    Object.values(yoyData).forEach(weeks => weeks.forEach(w => allWeeks.add(w.week)))
    return [...allWeeks].sort((a, b) => a - b).map(week => {
      const row = { week: `Wk ${week}` }
      Object.entries(yoyData).forEach(([year, weeks]) => {
        const match = weeks.find(w => w.week === week)
        row[`value_${year}`] = match ? match.value : 0
        row[`weight_${year}`] = match ? match.weight : 0
      })
      return row
    })
  }, [yoyData])

  const years = Object.keys(yoyData || {}).sort()

  if (!seasons || seasons.length === 0) return <p className="p-6 text-gray-500">No season data available yet.</p>

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {seasons.map(s => (
          <div key={s.year} className="bg-white rounded-xl shadow p-5 border-l-4 border-green-500">
            <h3 className="text-2xl font-black text-green-700">{s.year} Season</h3>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Donations</span><span className="font-bold">{s.total_donations}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Weight</span><span className="font-bold">{formatNum(s.total_weight)} lbs</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Value</span><span className="font-bold text-green-700">{formatMoney(s.total_value)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Donors</span><span className="font-bold">{s.unique_donors}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Servings</span><span className="font-bold">{s.servings_provided.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Dates</span><span className="font-bold text-xs">{s.date_range_start} to {s.date_range_end}</span></div>
            </div>
          </div>
        ))}
      </div>

      {years.length > 0 && chartData.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-bold mb-4">Weekly Dollar Value by Year</h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis tickFormatter={v => '$' + v} />
              <Tooltip formatter={v => formatMoney(v)} />
              <Legend />
              {years.map((year, i) => (
                <Line key={year} type="monotone" dataKey={`value_${year}`} name={year} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {years.length > 0 && chartData.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-bold mb-4">Weekly Weight (lbs) by Year</h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip formatter={v => formatNum(v) + ' lbs'} />
              <Legend />
              {years.map((year, i) => (
                <Line key={year} type="monotone" dataKey={`weight_${year}`} name={year} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {seasons.length > 0 && (
        <div className="bg-green-50 border-2 border-green-500 rounded-xl p-6 text-center">
          <h3 className="text-xl font-bold text-green-800 mb-4">All-Time Cumulative Impact</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <div className="text-4xl font-black text-green-700">{seasons.reduce((s, y) => s + y.total_donations, 0).toLocaleString()}</div>
              <div className="text-gray-600 mt-1">Total Donations</div>
            </div>
            <div>
              <div className="text-4xl font-black text-green-700">{formatNum(seasons.reduce((s, y) => s + y.total_weight, 0))}</div>
              <div className="text-gray-600 mt-1">Total Pounds</div>
            </div>
            <div>
              <div className="text-4xl font-black text-green-700">{formatMoney(seasons.reduce((s, y) => s + y.total_value, 0))}</div>
              <div className="text-gray-600 mt-1">Total Value</div>
            </div>
            <div>
              <div className="text-4xl font-black text-green-700">{seasons.reduce((s, y) => s + y.servings_provided, 0).toLocaleString()}</div>
              <div className="text-gray-600 mt-1">Total Servings</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Distributions Tab ──────────────────────────────────────────────────────
// End-of-day allocation: all produce received on a pickup day is pooled, then
// divided among the receiving organizations. Not tied to individual donors.
function DistributionsTab({ products, onChanged }) {
  const today = localToday()
  const [selDate, setSelDate] = useState(today)
  const [dayStatus, setDayStatus] = useState(null)
  const [dayDists, setDayDists] = useState([])
  const [recipients, setRecipients] = useState([])
  const [form, setForm] = useState({ recipient_name: '', product_name: '', weight: '', item_count: '' })
  const [newRecipient, setNewRecipient] = useState('')
  const [showRecipients, setShowRecipients] = useState(false)
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadDay = useCallback(() => {
    api(`/distributions/day-status/${selDate}`).then(setDayStatus).catch(() => setDayStatus(null))
    api(`/distributions?on_date=${selDate}`).then(setDayDists).catch(() => setDayDists([]))
  }, [selDate])
  const loadRecipients = useCallback(() => {
    api('/recipients?include_inactive=true').then(setRecipients).catch(() => {})
  }, [])
  useEffect(() => { loadDay() }, [loadDay])
  useEffect(() => { loadRecipients() }, [loadRecipients])

  const activeRecipients = recipients.filter(r => r.active)
  const receivedProducts = dayStatus?.products || []

  const handleAllocate = async (e) => {
    e.preventDefault()
    if (!form.recipient_name || !form.product_name || !form.weight) {
      setMessage({ type: 'error', text: 'Recipient, product, and weight are required.' })
      return
    }
    setSaving(true)
    try {
      await api('/distributions', {
        method: 'POST',
        body: JSON.stringify({
          distribution_date: selDate,
          recipient_name: form.recipient_name,
          product_name: form.product_name,
          weight: parseFloat(form.weight),
          item_count: form.item_count ? parseInt(form.item_count) : null,
        }),
      })
      setMessage({ type: 'success', text: `Allocated ${form.weight} lbs of ${form.product_name} to ${form.recipient_name}` })
      setForm({ recipient_name: form.recipient_name, product_name: '', weight: '', item_count: '' })
      loadDay()
      onChanged()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const [editingDist, setEditingDist] = useState(null)

  const handleSaveDist = async () => {
    const d = editingDist
    try {
      await api(`/distributions/${d.id}`, {
        method: 'PUT',
        body: JSON.stringify({ weight: parseFloat(d.weight), item_count: d.item_count ? parseInt(d.item_count) : null }),
      })
      setEditingDist(null)
      setMessage({ type: 'success', text: 'Allocation updated.' })
      loadDay()
      onChanged()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const handleAllocateRest = (p) => {
    if (p.remaining_weight <= 0) return
    setForm(f => ({ ...f, product_name: p.product_name, weight: String(p.remaining_weight) }))
  }

  const recipientTotals = useMemo(() => {
    const totals = {}
    dayDists.forEach(d => {
      const t = totals[d.recipient_name] || { weight: 0, value: 0 }
      t.weight += d.weight
      t.value += d.total_value
      totals[d.recipient_name] = t
    })
    return Object.entries(totals)
  }, [dayDists])

  const handleDeleteDist = async (d) => {
    if (!window.confirm(`Remove allocation of ${d.weight} lbs ${d.product_name} to ${d.recipient_name}?`)) return
    try {
      await api(`/distributions/${d.id}`, { method: 'DELETE' })
      loadDay()
      onChanged()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const handleAddRecipient = async (e) => {
    e.preventDefault()
    if (!newRecipient.trim()) return
    try {
      await api('/recipients', { method: 'POST', body: JSON.stringify({ name: newRecipient.trim() }) })
      setNewRecipient('')
      loadRecipients()
      setMessage({ type: 'success', text: `Added receiving organization "${newRecipient.trim()}"` })
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  return (
    <div className="p-6 space-y-6">
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{message.text}</div>
      )}

      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-gray-800">End-of-Day Distribution</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-500">Date:</label>
            <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
              className="px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Divide the day's pooled produce among receiving organizations. Allocations power the customer reports.
        </p>

        {/* Received vs allocated */}
        {receivedProducts.length === 0 && dayDists.length === 0 ? (
          <p className="text-gray-400 italic py-4 text-center">No donations recorded for {selDate} yet.</p>
        ) : (
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2 text-right">Received (lbs)</th>
                  <th className="px-4 py-2 text-right">Allocated (lbs)</th>
                  <th className="px-4 py-2 text-right">Remaining (lbs)</th>
                </tr>
              </thead>
              <tbody>
                {receivedProducts.map(p => (
                  <tr key={p.product_name} className="border-b">
                    <td className="px-4 py-2 font-semibold">{p.product_name}</td>
                    <td className="px-4 py-2 text-right">{formatNum(p.received_weight)}</td>
                    <td className="px-4 py-2 text-right">{formatNum(p.allocated_weight)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${p.remaining_weight < 0 ? 'text-red-600' : p.remaining_weight === 0 ? 'text-gray-400' : 'text-green-700'}`}>
                      {formatNum(p.remaining_weight)}{p.remaining_weight < 0 && ' ⚠️'}
                      {p.remaining_weight > 0 && (
                        <button onClick={() => handleAllocateRest(p)} title="Fill the form with the remaining weight"
                          className="ml-2 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold hover:bg-green-200">→ form</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {receivedProducts.some(p => p.remaining_weight < 0) && (
              <p className="text-xs text-red-600 mt-2">⚠️ More was allocated than received — double-check the weights.</p>
            )}
          </div>
        )}

        {/* Allocation form */}
        <form onSubmit={handleAllocate} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Deliver to *</label>
            <select value={form.recipient_name} onChange={e => setForm({ ...form, recipient_name: e.target.value })}
              className="w-full px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500 bg-white">
              <option value="">Select...</option>
              {activeRecipients.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Product *</label>
            <select value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })}
              className="w-full px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500 bg-white">
              <option value="">Select...</option>
              {receivedProducts.length > 0 && (
                <optgroup label={`Received on ${selDate}`}>
                  {receivedProducts.map(p => <option key={p.product_name} value={p.product_name}>{p.product_name} ({formatNum(p.remaining_weight)} lbs left)</option>)}
                </optgroup>
              )}
              <optgroup label="All products">
                {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Weight (lbs) *</label>
            <input type="number" step="0.1" min="0" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })}
              className="w-full px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" placeholder="0.0" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1"># Items</label>
            <input type="number" step="1" min="0" value={form.item_count} onChange={e => setForm({ ...form, item_count: e.target.value })}
              className="w-full px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" placeholder="opt." />
          </div>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-semibold sm:col-span-5 lg:col-span-1">
            {saving ? 'Saving...' : 'Allocate'}
          </button>
        </form>
      </div>

      {/* Day's allocations */}
      {dayDists.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="bg-blue-600 text-white px-6 py-4"><h2 className="text-lg font-bold">Allocations for {selDate} ({dayDists.length})</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="px-4 py-2">Recipient</th>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2 text-right"># Items</th>
                  <th className="px-4 py-2 text-right">Weight (lbs)</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dayDists.map(d => {
                  const isEditing = editingDist?.id === d.id
                  return (
                    <tr key={d.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-semibold">{d.recipient_name}</td>
                      <td className="px-4 py-2">{d.product_name}</td>
                      <td className="px-4 py-2 text-right">
                        {isEditing ? <input type="number" step="1" min="0" value={editingDist.item_count ?? ''} onChange={e => setEditingDist({ ...editingDist, item_count: e.target.value })}
                          className="w-16 px-2 py-1 border-2 border-amber-400 rounded text-right outline-none" /> : (d.item_count ?? '—')}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {isEditing ? <input type="number" step="0.1" min="0" inputMode="decimal" value={editingDist.weight} onChange={e => setEditingDist({ ...editingDist, weight: e.target.value })}
                          className="w-20 px-2 py-1 border-2 border-amber-400 rounded text-right outline-none" autoFocus /> : formatNum(d.weight)}
                      </td>
                      <td className="px-4 py-2 text-right text-green-700 font-semibold">{formatMoney(d.total_value)}</td>
                      <td className="px-4 py-2 text-center">
                        {isEditing ? (
                          <div className="flex gap-1 justify-center">
                            <button onClick={handleSaveDist} className="px-3 py-2 bg-green-600 text-white rounded text-xs hover:bg-green-700 font-semibold">Save</button>
                            <button onClick={() => setEditingDist(null)} className="px-3 py-2 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => setEditingDist({ id: d.id, weight: String(d.weight), item_count: d.item_count })}
                              className="px-3 py-2 bg-amber-100 text-amber-700 rounded text-xs hover:bg-amber-200 font-semibold">Edit</button>
                            <button onClick={() => handleDeleteDist(d)}
                              className="px-3 py-2 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 font-semibold">Remove</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {recipientTotals.length > 0 && (
            <div className="px-6 py-3 bg-blue-50 border-t flex flex-wrap gap-x-8 gap-y-1 text-sm">
              {recipientTotals.map(([name, t]) => (
                <span key={name}><span className="font-bold text-blue-800">{name}:</span> <span className="text-gray-700">{formatNum(t.weight)} lbs · {formatMoney(t.value)}</span></span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manage receiving organizations */}
      <div className="bg-white rounded-xl shadow p-6">
        <button onClick={() => setShowRecipients(!showRecipients)} className="text-sm font-semibold text-blue-600 hover:text-blue-800">
          {showRecipients ? '▾' : '▸'} Manage Receiving Organizations ({activeRecipients.length})
        </button>
        {showRecipients && (
          <div className="mt-4 space-y-3">
            <form onSubmit={handleAddRecipient} className="flex gap-2">
              <input type="text" placeholder="New organization name" value={newRecipient}
                onChange={e => setNewRecipient(e.target.value)}
                className="flex-1 px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
              <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold">Add</button>
            </form>
            {recipients.map(r => (
              <div key={r.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${r.active ? 'bg-gray-50' : 'bg-gray-100 opacity-60'}`}>
                <span className="font-semibold text-sm">{r.name}</span>
                {r.active ? (
                  <button onClick={async () => { await api(`/recipients/${r.id}/deactivate`, { method: 'POST' }).catch(err => setMessage({ type: 'error', text: err.message })); loadRecipients() }}
                    className="px-3 py-2 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 font-semibold">Deactivate</button>
                ) : (
                  <button onClick={async () => { await api('/recipients', { method: 'POST', body: JSON.stringify({ name: r.name }) }).catch(err => setMessage({ type: 'error', text: err.message })); loadRecipients() }}
                    className="px-3 py-2 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 font-semibold">Reactivate</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Reports Tab ────────────────────────────────────────────────────────────
const REPORT_TYPES = [
  { id: 'daily', label: 'Daily Chronological', daily: true, desc: 'Every donation line for a pickup day, in entry order, plus that day\'s distributions.' },
  { id: 'daily-summary', label: 'Daily Produce Summary', daily: true, desc: 'One row per produce type for a day — for public reporting and social media.' },
  { id: 'daily-donors', label: 'Daily Donor Report', daily: true, desc: 'The day\'s donations grouped by donor, largest first, with a day total.' },
  { id: 'ytd-donors', label: 'YTD by Donor', daily: false, desc: 'Season-to-date produce by donor, with per-donor subtotals.' },
  { id: 'ytd-customers', label: 'YTD by Customer', daily: false, desc: 'Season-to-date produce delivered to each receiving organization.' },
  { id: 'ytd-produce', label: 'YTD Produce Summary', daily: false, desc: 'Season-to-date totals for every produce type.' },
  { id: 'donor-history', label: 'Donor History', daily: false, donor: true, desc: 'One donor\'s full season — every donation in order plus a produce summary. Share it with the donor as a record of their impact.' },
]

function reportRows3(l) { return [l.product_name, l.items ?? '—', formatNum(l.weight), formatMoney(l.value)] }

function ReportsTab({ seasons, donors }) {
  const today = localToday()
  const currentYear = new Date().getFullYear()
  const [reportType, setReportType] = useState('daily-summary')
  const [selDate, setSelDate] = useState(today)
  const [selYear, setSelYear] = useState(currentYear)
  const [selDonor, setSelDonor] = useState('')
  const [availDates, setAvailDates] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const rt = REPORT_TYPES.find(r => r.id === reportType)
  const years = [...new Set([...(seasons || []).map(s => s.year), currentYear])].sort((a, b) => b - a)

  useEffect(() => {
    api(`/reports/dates?year=${selDate.slice(0, 4)}`).then(setAvailDates).catch(() => {})
  }, [selDate])

  useEffect(() => {
    setError(null)
    setData(null)  // old report's shape must not render under the new type
    if (rt.donor && !selDonor) { setLoading(false); return }
    setLoading(true)
    const path = rt.donor
      ? `/reports/donor-history?donor=${encodeURIComponent(selDonor)}&year=${selYear}`
      : rt.daily
        ? `/reports/${reportType}/${selDate}`
        : `/reports/ytd/${reportType.replace('ytd-', '')}?year=${selYear}`
    api(path).then(d => { setData(d); setLoading(false) }).catch(err => { setError(err.message); setData(null); setLoading(false) })
  }, [reportType, selDate, selYear, selDonor])

  const title = rt.donor
    ? `Donation History — ${selDonor || 'select a donor'} — ${selYear} Season`
    : rt.daily
      ? `${rt.label} — ${new Date(selDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`
      : `${rt.label} — ${selYear} Season`

  const downloadCsvReport = () => {
    const name = `GrowARow_${reportType}_${rt.donor ? selDonor.replace(/[^A-Za-z0-9]+/g, '_') + '_' + selYear : rt.daily ? selDate : selYear}.csv`
    if (reportType === 'daily') {
      downloadCsv(name, ['Donor', 'Product', 'Items', 'Weight (lbs)', 'Value'],
        data.lines.map(l => [l.donor_name, l.product_name, l.items ?? '', l.weight, l.value]))
    } else if (reportType === 'daily-summary' || reportType === 'ytd-produce') {
      downloadCsv(name, ['Product', 'Items', 'Weight (lbs)', 'Value'],
        data.rows.map(l => [l.product_name, l.items ?? '', l.weight, l.value]))
    } else if (reportType === 'donor-history') {
      downloadCsv(name, ['Date', 'Product', 'Items', 'Weight (lbs)', 'Value'],
        data.lines.map(l => [l.date, l.product_name, l.items ?? '', l.weight, l.value]))
    } else {
      const groups = reportType === 'daily-donors' ? data.donors : data.groups
      downloadCsv(name, [reportType === 'ytd-customers' ? 'Recipient' : 'Donor', 'Product', 'Items', 'Weight (lbs)', 'Value'],
        groups.flatMap(g => g.lines.map(l => [g.donor_name || g.name, l.product_name, l.items ?? '', l.weight, l.value])))
    }
  }

  const downloadPdf = async () => {
    const { default: jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.setTextColor(22, 101, 52)
    doc.text('Grow-A-Row', 14, 18)
    doc.setFontSize(12)
    doc.setTextColor(60)
    doc.text(title, 14, 26)
    doc.setFontSize(9)
    doc.setTextColor(130)
    doc.text(`Generated ${new Date().toLocaleDateString()} · Fresh Produce Donation Tracker`, 14, 32)
    let y = 38

    const tbl = (head, body, foot) => {
      autoTable(doc, { startY: y, head: [head], body, foot: foot ? [foot] : undefined,
        theme: 'striped', headStyles: { fillColor: [22, 101, 52] }, footStyles: { fillColor: [240, 253, 244], textColor: [22, 101, 52], fontStyle: 'bold' },
        styles: { fontSize: 9 } })
      y = doc.lastAutoTable.finalY + 8
    }
    const totalsFoot = (label, t) => [label, t.items ?? '—', formatNum(t.weight), formatMoney(t.value)]

    if (reportType === 'daily') {
      tbl(['Donor', 'Product', '# Items', 'Weight (lbs)', 'Value'],
        data.lines.map(l => [l.donor_name, l.product_name, l.items ?? '—', formatNum(l.weight), formatMoney(l.value)]),
        data.totals ? ['DAY TOTAL', '', data.totals.items ?? '—', formatNum(data.totals.weight), formatMoney(data.totals.value)] : null)
      if (data.distributions.length > 0) {
        doc.setFontSize(11); doc.setTextColor(60); doc.text('Distributed to Receiving Organizations', 14, y); y += 4
        tbl(['Recipient', 'Product', '# Items', 'Weight (lbs)', 'Value'],
          data.distributions.map(l => [l.recipient_name, l.product_name, l.items ?? '—', formatNum(l.weight), formatMoney(l.value)]),
          data.distribution_totals ? ['TOTAL', '', data.distribution_totals.items ?? '—', formatNum(data.distribution_totals.weight), formatMoney(data.distribution_totals.value)] : null)
      }
    } else if (reportType === 'daily-summary' || reportType === 'ytd-produce') {
      tbl(['Product', '# Items', 'Weight (lbs)', 'Value'],
        data.rows.map(reportRows3),
        data.totals ? totalsFoot('TOTAL', data.totals) : null)
    } else if (reportType === 'donor-history') {
      tbl(['Date', 'Product', '# Items', 'Weight (lbs)', 'Value'],
        data.lines.map(l => [new Date(l.date + 'T12:00:00').toLocaleDateString(), l.product_name, l.items ?? '—', formatNum(l.weight), formatMoney(l.value)]),
        data.totals ? ['SEASON TOTAL', '', data.totals.items ?? '—', formatNum(data.totals.weight), formatMoney(data.totals.value)] : null)
      doc.setFontSize(11); doc.setTextColor(60); doc.text('Produce Summary', 14, y); y += 4
      tbl(['Product', '# Donations', '# Items', 'Weight (lbs)', 'Value'],
        data.summary.map(s => [s.product_name, s.donations, s.items ?? '—', formatNum(s.weight), formatMoney(s.value)]))
      doc.setFontSize(10); doc.setTextColor(22, 101, 52)
      doc.text(`Thank you, ${data.donor_name}, for fighting food insecurity with us!`, 14, y)
    } else {
      const groups = reportType === 'daily-donors' ? data.donors : data.groups
      groups.forEach(g => {
        const name = g.donor_name || g.name
        doc.setFontSize(11); doc.setTextColor(30); doc.text(name, 14, y); y += 4
        tbl(['Product', '# Items', 'Weight (lbs)', 'Value'],
          g.lines.map(reportRows3),
          totalsFoot('Subtotal', g.subtotal))
      })
      if (data.totals) {
        doc.setFontSize(12); doc.setTextColor(22, 101, 52)
        doc.text(`GRAND TOTAL: ${formatNum(data.totals.weight)} lbs · ${formatMoney(data.totals.value)}${data.totals.items ? ` · ${data.totals.items} items` : ''}`, 14, y)
      }
    }
    doc.save(`GrowARow_${reportType}_${rt.donor ? selDonor.replace(/[^A-Za-z0-9]+/g, '_') + '_' + selYear : rt.daily ? selDate : selYear}.pdf`)
  }

  const Th = ({ children, right }) => <th className={`px-4 py-2 ${right ? 'text-right' : 'text-left'}`}>{children}</th>
  const Td = ({ children, right, bold, green }) => <td className={`px-4 py-2 ${right ? 'text-right' : ''} ${bold ? 'font-semibold' : ''} ${green ? 'text-green-700 font-semibold' : ''}`}>{children}</td>
  const TotalsRow = ({ label, t, span }) => (
    <tr className="bg-green-50 font-bold text-green-800 border-t-2 border-green-300">
      <Td bold>{label}</Td>
      {span > 1 && <Td />}
      <Td right>{t.items ?? '—'}</Td>
      <Td right>{formatNum(t.weight)}</Td>
      <Td right>{formatMoney(t.value)}</Td>
    </tr>
  )

  const hasData = data && ((data.lines?.length) || (data.rows?.length) || (data.donors?.length) || (data.groups?.length))

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {REPORT_TYPES.map(r => (
            <button key={r.id} onClick={() => { setData(null); setReportType(r.id) }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${reportType === r.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-100'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-500 mb-4">{rt.desc}</p>
        <div className="flex flex-wrap items-center gap-3">
          {rt.donor && (
            <>
              <label className="text-sm font-semibold text-gray-500">Donor:</label>
              <select value={selDonor} onChange={e => setSelDonor(e.target.value)}
                className="px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500 bg-white">
                <option value="">Select a donor...</option>
                {donors.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
              <label className="text-sm font-semibold text-gray-500">Season:</label>
              <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}
                className="px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500 bg-white">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          )}
          {!rt.donor && rt.daily ? (
            <>
              <label className="text-sm font-semibold text-gray-500">Pickup day:</label>
              <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
                className="px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500" />
              {availDates.length > 0 && (
                <select value={availDates.includes(selDate) ? selDate : ''} onChange={e => e.target.value && setSelDate(e.target.value)}
                  className="px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500 bg-white text-sm">
                  <option value="">Jump to a day with donations...</option>
                  {availDates.map(d => <option key={d} value={d}>{new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</option>)}
                </select>
              )}
            </>
          ) : !rt.donor ? (
            <>
              <label className="text-sm font-semibold text-gray-500">Season:</label>
              <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}
                className="px-3 py-2 border-2 rounded-lg outline-none focus:border-green-500 bg-white">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          ) : null}
          {hasData && (
            <div className="ml-auto flex gap-2">
              <button onClick={downloadCsvReport}
                className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-semibold text-sm">
                ⬇ CSV
              </button>
              <button onClick={downloadPdf}
                className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold text-sm">
                ⬇ PDF
              </button>
              <button onClick={() => window.print()}
                className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold text-sm">
                🖨 Print
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="bg-green-700 text-white px-6 py-4"><h2 className="text-lg font-bold">{title}</h2></div>
        {loading && <p className="p-6 text-gray-400">Loading report…</p>}
        {error && <p className="p-6 text-red-600">{error}</p>}
        {!loading && !error && !hasData && (
          <p className="p-6 text-gray-400 italic">
            {rt.donor && !selDonor ? 'Select a donor above to view their donation history.' : `No data for this ${rt.daily ? 'day' : 'season'} yet.`}
          </p>
        )}

        {!loading && !error && hasData && (
          <div className="overflow-x-auto">
            {reportType === 'daily' && data.lines && (
              <>
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-100"><Th>Donor</Th><Th>Product</Th><Th right># Items</Th><Th right>Weight (lbs)</Th><Th right>Value</Th></tr></thead>
                  <tbody>
                    {data.lines.map((l, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <Td bold>{l.donor_name}</Td><Td>{l.product_name}</Td><Td right>{l.items ?? '—'}</Td><Td right>{formatNum(l.weight)}</Td><Td right green>{formatMoney(l.value)}</Td>
                      </tr>
                    ))}
                    {data.totals && <TotalsRow label="DAY TOTAL" t={data.totals} span={2} />}
                  </tbody>
                </table>
                {data.distributions.length > 0 && (
                  <div className="border-t-4 border-blue-100">
                    <div className="px-6 py-3 bg-blue-50 font-bold text-blue-800 text-sm">Distributed to Receiving Organizations</div>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-100"><Th>Recipient</Th><Th>Product</Th><Th right># Items</Th><Th right>Weight (lbs)</Th><Th right>Value</Th></tr></thead>
                      <tbody>
                        {data.distributions.map((l, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <Td bold>{l.recipient_name}</Td><Td>{l.product_name}</Td><Td right>{l.items ?? '—'}</Td><Td right>{formatNum(l.weight)}</Td><Td right green>{formatMoney(l.value)}</Td>
                          </tr>
                        ))}
                        {data.distribution_totals && <TotalsRow label="TOTAL" t={data.distribution_totals} span={2} />}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {reportType === 'donor-history' && data.lines && (
              <>
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-100"><Th>Date</Th><Th>Product</Th><Th right># Items</Th><Th right>Weight (lbs)</Th><Th right>Value</Th></tr></thead>
                  <tbody>
                    {data.lines.map((l, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <Td>{new Date(l.date + 'T12:00:00').toLocaleDateString()}</Td><Td bold>{l.product_name}</Td><Td right>{l.items ?? '—'}</Td><Td right>{formatNum(l.weight)}</Td><Td right green>{formatMoney(l.value)}</Td>
                      </tr>
                    ))}
                    {data.totals && <TotalsRow label="SEASON TOTAL" t={data.totals} span={2} />}
                  </tbody>
                </table>
                <div className="border-t-4 border-green-100">
                  <div className="px-6 py-3 bg-green-50 font-bold text-green-800 text-sm">Produce Summary</div>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-100"><Th>Product</Th><Th right># Donations</Th><Th right># Items</Th><Th right>Weight (lbs)</Th><Th right>Value</Th></tr></thead>
                    <tbody>
                      {data.summary.map((s, i) => (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <Td bold>{s.product_name}</Td><Td right>{s.donations}</Td><Td right>{s.items ?? '—'}</Td><Td right>{formatNum(s.weight)}</Td><Td right green>{formatMoney(s.value)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {(reportType === 'daily-summary' || reportType === 'ytd-produce') && data.rows && (
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-100"><Th>Product</Th><Th right># Items</Th><Th right>Weight (lbs)</Th><Th right>Value</Th></tr></thead>
                <tbody>
                  {data.rows.map((l, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <Td bold>{l.product_name}</Td><Td right>{l.items ?? '—'}</Td><Td right>{formatNum(l.weight)}</Td><Td right green>{formatMoney(l.value)}</Td>
                    </tr>
                  ))}
                  {data.totals && <TotalsRow label="TOTAL" t={data.totals} span={1} />}
                </tbody>
              </table>
            )}

            {(reportType === 'daily-donors' || reportType === 'ytd-donors' || reportType === 'ytd-customers') && (
              <div>
                {((reportType === 'daily-donors' ? data.donors : data.groups) || []).map((g, gi) => (
                  <div key={gi} className="border-b-4 border-gray-100">
                    <div className="px-6 py-3 bg-gray-50 font-bold text-gray-800">{g.donor_name || g.name}</div>
                    <table className="w-full text-sm">
                      <tbody>
                        {g.lines.map((l, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <Td>{l.product_name}</Td><Td right>{l.items ?? '—'}</Td><Td right>{formatNum(l.weight)}</Td><Td right green>{formatMoney(l.value)}</Td>
                          </tr>
                        ))}
                        <TotalsRow label="Subtotal" t={g.subtotal} span={1} />
                      </tbody>
                    </table>
                  </div>
                ))}
                {data.totals && (
                  <div className="px-6 py-4 bg-green-100 font-black text-green-800 text-lg flex flex-wrap gap-x-8">
                    <span>GRAND TOTAL</span>
                    {data.totals.items && <span>{data.totals.items.toLocaleString()} items</span>}
                    <span>{formatNum(data.totals.weight)} lbs</span>
                    <span>{formatMoney(data.totals.value)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── About This App Tab ──────────────────────────────────────────────────
// ─── Board Reports Archive ──────────────────────────────────────────────────
// Public archive of published Select Board reports. Each report is a static
// page under /reports/<slug>/, listed in /reports/reports.json.
function ReportArchiveTab() {
  const [reports, setReports] = useState(null)

  useEffect(() => {
    fetch('/reports/reports.json')
      .then(r => r.json())
      .then(d => setReports(d.reports || []))
      .catch(() => setReports([]))
  }, [])

  if (reports === null) return <p className="p-6 text-gray-500">Loading reports...</p>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-green-700">Board Reports</h2>
        <p className="text-gray-500 text-sm mt-1">Published reports to the Chelmsford Select Board</p>
      </div>
      {reports.length === 0 && <p className="text-gray-400 italic text-center">No reports published yet.</p>}
      {reports.map(r => (
        <a key={r.slug} href={`/reports/${r.slug}/`}
          className="block bg-white rounded-xl shadow p-6 border-l-4 border-green-600 hover:shadow-md hover:bg-green-50 transition-all">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="font-bold text-lg text-gray-800">{r.title}</div>
              <div className="text-sm text-gray-500 mt-0.5">{r.period}</div>
              {r.summary && <div className="text-sm text-gray-600 mt-2">{r.summary}</div>}
            </div>
            <div className="text-xs text-gray-400 whitespace-nowrap">
              {new Date(r.published + 'T12:00:00').toLocaleDateString('en-US', { month: 'long' , day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </a>
      ))}
    </div>
  )
}

function AboutTab() {
  const stats = {
    totalLines: 4200,
    files: 12,
    languages: [
      { name: 'Python', lines: 1650, color: '#3572A5', usage: 'Backend API, tests, migrations' },
      { name: 'JavaScript (JSX)', lines: 2450, color: '#f7df1e', usage: 'Frontend UI, interactive dashboard' },
      
      { name: 'HTML', lines: 14, color: '#e34c26', usage: 'Entry point, meta tags' },
      { name: 'CSS', lines: 17, color: '#563d7c', usage: 'Base reset styles' },
      { name: 'JSON', lines: 42, color: '#292929', usage: 'Package config, deployment config' },
    ],
    frameworks: [
      { name: 'React 18', role: 'Frontend UI framework', url: 'https://react.dev' },
      { name: 'Vite', role: 'Frontend build tool & dev server', url: 'https://vitejs.dev' },
      { name: 'FastAPI', role: 'Backend REST API framework (Python)', url: 'https://fastapi.tiangolo.com' },
      { name: 'SQLAlchemy', role: 'Python ORM for database models', url: 'https://sqlalchemy.org' },
      { name: 'Recharts', role: 'Charting library for data visualizations', url: 'https://recharts.org' },
      { name: 'Tailwind CSS', role: 'Utility-first CSS framework for styling', url: 'https://tailwindcss.com' },
      { name: 'Pydantic', role: 'Data validation and serialization', url: 'https://pydantic.dev' },
    ],
    infrastructure: [
      { name: 'Railway', role: 'Backend API hosting + PostgreSQL database', url: 'https://railway.app' },
      { name: 'Vercel', role: 'Frontend static site hosting & CDN', url: 'https://vercel.com' },
      { name: 'GitHub', role: 'Source code repository & CI/CD trigger', url: 'https://github.com' },
      { name: 'PostgreSQL', role: 'Relational database for all donation data', url: 'https://postgresql.org' },
    ],
    ai: {
      agent: 'Claude (Anthropic)',
      model: 'Claude Fable 5',
      role: 'Full-stack AI development agent',
      description: 'This entire application — backend, frontend, database schema, deployment configuration, and documentation — was designed and written by Claude, Anthropic\'s AI assistant, through an interactive conversation with a human collaborator.',
      estimatedTokens: '~200,000+',
      sessionsNote: 'Built across multiple collaborative sessions, iterating from an Excel spreadsheet to a full cloud-hosted web application.',
    },
  }

  const maxLines = Math.max(...stats.languages.map(l => l.lines))

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Hero */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-100 border-2 border-green-300 rounded-2xl p-8 text-center">
        <div className="text-6xl mb-3">🌱</div>
        <h2 className="text-3xl font-black text-green-800">Grow-A-Row Impact Dashboard</h2>
        <p className="text-green-600 mt-2 text-lg">Fighting Food Insecurity One Tomato at a Time</p>
        <p className="text-gray-500 mt-3 text-sm max-w-xl mx-auto">
          A full-stack web application for tracking fresh produce donations to food-insecure families.
          Built to replace manual spreadsheet tracking with a collaborative, real-time dashboard.
        </p>
      </div>

      {/* By the Numbers */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-xl font-bold mb-4 text-gray-800">By the Numbers</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-black text-blue-600">{stats.totalLines.toLocaleString()}</div>
            <div className="text-gray-500 text-sm mt-1">Lines of Code</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-black text-purple-600">{stats.files}</div>
            <div className="text-gray-500 text-sm mt-1">Source Files</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-black text-amber-600">{stats.languages.length}</div>
            <div className="text-gray-500 text-sm mt-1">Languages</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-black text-green-600">55+</div>
            <div className="text-gray-500 text-sm mt-1">API Endpoints</div>
          </div>
        </div>
      </div>

      {/* Languages Breakdown */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-xl font-bold mb-4 text-gray-800">Languages Used</h3>
        <div className="space-y-3">
          {stats.languages.map(lang => (
            <div key={lang.name}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-semibold">{lang.name}</span>
                <span className="text-gray-500">{lang.lines} lines &middot; {lang.usage}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div className="h-3 rounded-full transition-all" style={{ width: `${(lang.lines / maxLines) * 100}%`, backgroundColor: lang.color }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Frameworks & Libraries */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-xl font-bold mb-4 text-gray-800">Frameworks & Libraries</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {stats.frameworks.map(fw => (
            <div key={fw.name} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
              <div className="w-2 h-2 rounded-full bg-green-500 mt-2 flex-shrink-0"></div>
              <div>
                <div className="font-semibold text-gray-800">{fw.name}</div>
                <div className="text-gray-500 text-sm">{fw.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Infrastructure */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-xl font-bold mb-4 text-gray-800">Infrastructure & Hosting</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {stats.infrastructure.map(inf => (
            <div key={inf.name} className="flex items-start gap-3 bg-blue-50 rounded-lg p-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
              <div>
                <div className="font-semibold text-gray-800">{inf.name}</div>
                <div className="text-gray-500 text-sm">{inf.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Agent */}
      <div className="bg-gradient-to-br from-violet-50 to-purple-100 border-2 border-purple-300 rounded-xl p-6">
        <h3 className="text-xl font-bold mb-3 text-purple-800">AI-Powered Development</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-white bg-opacity-70 rounded-lg p-4 text-center">
            <div className="text-2xl font-black text-purple-700">{stats.ai.agent}</div>
            <div className="text-gray-500 text-sm mt-1">AI Agent</div>
          </div>
          <div className="bg-white bg-opacity-70 rounded-lg p-4 text-center">
            <div className="text-2xl font-black text-purple-700">{stats.ai.model}</div>
            <div className="text-gray-500 text-sm mt-1">Model</div>
          </div>
          <div className="bg-white bg-opacity-70 rounded-lg p-4 text-center">
            <div className="text-2xl font-black text-purple-700">{stats.ai.estimatedTokens}</div>
            <div className="text-gray-500 text-sm mt-1">Estimated Tokens</div>
          </div>
        </div>
        <p className="text-purple-900 text-sm leading-relaxed">{stats.ai.description}</p>
        <p className="text-purple-700 text-sm mt-2 italic">{stats.ai.sessionsNote}</p>
      </div>

      {/* Architecture Diagram */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-xl font-bold mb-4 text-gray-800">Architecture Overview</h3>
        <div className="bg-gray-50 rounded-lg p-6 font-mono text-sm text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="bg-blue-100 border-2 border-blue-400 rounded-lg px-6 py-3 font-bold">
              Browser (React + Recharts + Tailwind)
            </div>
            <div className="text-gray-400 text-lg">↕ HTTPS</div>
            <div className="bg-green-100 border-2 border-green-400 rounded-lg px-6 py-3 font-bold">
              Vercel CDN (Static Hosting)
            </div>
            <div className="text-gray-400 text-lg">↕ API Calls</div>
            <div className="bg-amber-100 border-2 border-amber-400 rounded-lg px-6 py-3 font-bold">
              Railway (FastAPI + Uvicorn)
            </div>
            <div className="text-gray-400 text-lg">↕ SQL</div>
            <div className="bg-purple-100 border-2 border-purple-400 rounded-lg px-6 py-3 font-bold">
              PostgreSQL Database
            </div>
          </div>
        </div>
      </div>

      {/* Version History */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="text-xl font-bold mb-4 text-gray-800">Evolution</h3>
        <div className="space-y-4">
          {[
            { step: '1', title: 'Excel Dashboard', desc: 'Started as a spreadsheet with price lookups, formulas, and pivot-style analysis across 9 sheets.' },
            { step: '2', title: 'Local HTML Dashboard', desc: 'Converted to an interactive browser-based dashboard with charts and filtering — zero dependencies.' },
            { step: '3', title: 'Full-Stack Web App', desc: 'Built a Python backend API with PostgreSQL, deployed to Railway, with a React frontend on Vercel.' },
            { step: '4', title: 'Year-over-Year Tracking', desc: 'Added season archival, multi-year comparison charts, and cumulative impact tracking across all years.' },
            { step: '5', title: 'Season-Specific Pricing & PIN Security', desc: 'Added per-season pricing so historical values are preserved, PIN protection for write access, and an automated pricing research agent.' },
            { step: '6', title: 'Distributions, Reports & Full Editing', desc: 'Added end-of-day distribution tracking to receiving organizations, six printable/PDF reports, donor management with add-on-the-spot entry, item counts, mid-season price changes, and server-side PIN enforcement.' },
          ].map(item => (
            <div key={item.step} className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-full bg-green-600 text-white font-bold flex items-center justify-center flex-shrink-0">{item.step}</div>
              <div>
                <div className="font-semibold text-gray-800">{item.title}</div>
                <div className="text-gray-500 text-sm">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── PIN Gate ────────────────────────────────────────────────────────────────
function PinGate({ children, unlocked, onUnlock }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
  const [errorText, setErrorText] = useState(null)

  // hooks above, early return below — never between
  if (unlocked) return children

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!pin || checking) return
    setChecking(true)
    setErrorText(null)
    const result = await verifyPin(pin)
    setChecking(false)
    if (result.ok) {
      setApiPin(pin)
      onUnlock()
      setError(false)
    } else {
      setError(true)
      setErrorText(typeof result.error === 'string' ? result.error : 'Incorrect PIN. Please try again.')
      setPin('')
    }
  }

  return (
    <div className="p-6 max-w-sm mx-auto mt-8">
      <div className="bg-white rounded-xl shadow p-8 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">PIN Required</h2>
        <p className="text-gray-500 text-sm mb-6">Enter the volunteer PIN to add or edit data.</p>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
            {errorText || 'Incorrect PIN. Please try again.'}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={pin}
            onChange={e => { setPin(e.target.value); setError(false) }}
            placeholder="Enter PIN"
            className="w-full px-4 py-3 border-2 rounded-lg text-center text-2xl tracking-widest outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
            autoFocus
          />
          <button type="submit" disabled={checking}
            className="w-full py-3 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 transition-colors">
            {checking ? 'Checking...' : 'Unlock'}
          </button>
        </form>
        <p className="text-gray-400 text-xs mt-4">Contact your Grow-A-Row coordinator for the PIN.</p>
      </div>
    </div>
  )
}

// ─── Error Boundary ─────────────────────────────────────────────────────────
// One tab crashing must never white-screen the whole dashboard
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 max-w-lg mx-auto mt-8 text-center">
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-8">
            <div className="text-4xl mb-3">😵</div>
            <h2 className="text-xl font-bold text-red-800 mb-2">This tab hit an error</h2>
            <p className="text-red-600 text-sm mb-4">The rest of the dashboard still works — switch tabs or reload.</p>
            <button onClick={() => window.location.reload()}
              className="px-5 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700">Reload</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  // Volunteers on phones land straight on the entry form; analysis tabs are a tap away
  const [tab, setTab] = useState(() => (window.innerWidth < 768 && Boolean(apiPin)) ? 'add' : 'overview')
  const [metrics, setMetrics] = useState(null)
  const [donorStats, setDonorStats] = useState([])
  const [productStats, setProductStats] = useState([])
  const [donations, setDonations] = useState([])
  const [products, setProducts] = useState([])
  const [donors, setDonors] = useState([])
  const [seasons, setSeasons] = useState([])
  const [yoyData, setYoyData] = useState(null)
  const [selectedYear, setSelectedYear] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // A stored PIN unlocks optimistically; the server re-checks on every write and
  // a 401 fires gar-pin-invalid to relock (e.g. after John rotates the PIN)
  const [pinUnlocked, setPinUnlocked] = useState(() => Boolean(apiPin))
  useEffect(() => {
    const relock = () => setPinUnlocked(false)
    window.addEventListener('gar-pin-invalid', relock)
    return () => window.removeEventListener('gar-pin-invalid', relock)
  }, [])

  const [filterDonor, setFilterDonor] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // Debounce the text filters — each keystroke used to fire six API calls
  const [debouncedDonor, setDebouncedDonor] = useState('')
  const [debouncedProduct, setDebouncedProduct] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedDonor(filterDonor); setDebouncedProduct(filterProduct) }, 400)
    return () => clearTimeout(t)
  }, [filterDonor, filterProduct])

  useEffect(() => {
    api('/seasons').then(s => {
      setSeasons(s)
      if (s.length > 0) setSelectedYear(s[0].year)
    }).catch(() => {})
    api('/stats/year-over-year').then(setYoyData).catch(() => {})
  }, [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (debouncedDonor) params.set('donor_name', debouncedDonor)
      if (debouncedProduct) params.set('product_name', debouncedProduct)

      if (!filterFrom && !filterTo && selectedYear) {
        params.set('start_date', `${selectedYear}-01-01`)
        params.set('end_date', `${selectedYear}-12-31`)
      } else {
        if (filterFrom) params.set('start_date', filterFrom)
        if (filterTo) params.set('end_date', filterTo)
      }
      const qs = params.toString() ? '?' + params.toString() : ''
      const yearParam = selectedYear && !filterFrom && !filterTo ? `?year=${selectedYear}` : ''

      const [m, ds, ps, d, pr, dn] = await Promise.all([
        api('/metrics' + qs),
        api('/stats/donors/by-year' + yearParam),
        api('/stats/products/by-year' + yearParam),
        api('/donations' + qs),
        api('/products'),
        api('/donors'),
      ])
      setMetrics(m)
      setDonorStats(ds)
      setProductStats(ps)
      setDonations(d)
      setProducts(pr)
      setDonors(dn)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [debouncedDonor, debouncedProduct, filterFrom, filterTo, selectedYear])

  useEffect(() => { loadData() }, [loadData])

  const refreshSeasons = () => {
    api('/seasons').then(setSeasons).catch(() => {})
    api('/stats/year-over-year').then(setYoyData).catch(() => {})
  }

  // Nav grouped into labeled category columns — every tab visible, organized by task
  const navGroups = [
    { label: 'Home', items: [
      { id: 'overview', label: 'Overview', icon: '📊' },
      { id: 'about', label: 'About', icon: 'ℹ️' },
    ]},
    { label: 'Donations', items: [
      { id: 'add', label: 'Add Donation', icon: '➕' },
      { id: 'donations', label: 'All Donations', icon: '📋' },
      { id: 'donors', label: 'Donors', icon: '👥' },
    ]},
    { label: 'Produce', items: [
      { id: 'products', label: 'Products', icon: '🥬' },
      { id: 'manage', label: 'Manage Products', icon: '⚙️' },
    ]},
    { label: 'Deliveries', items: [
      { id: 'distributions', label: 'Distributions', icon: '🚚' },
    ]},
    { label: 'Trends', items: [
      { id: 'trends', label: 'Trends', icon: '📈' },
      { id: 'yoy', label: 'Year over Year', icon: '📅' },
    ]},
    { label: 'Reports', items: [
      { id: 'reports', label: 'Reports', icon: '📄' },
      { id: 'archive', label: 'Board Reports', icon: '📰' },
    ]},
  ]

  const hasFilters = filterDonor || filterProduct || filterFrom || filterTo

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-700 to-green-500 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-5 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-black tracking-tight">🌱 Grow-A-Row</h1>
            <p className="text-green-100 text-sm mt-0.5">Fresh Produce Donation Tracker</p>
          </div>
          {metrics && !loading && (
            <div className="text-right text-sm">
              <div className="text-green-100">{selectedYear ? `${selectedYear} Season` : 'All Time'}</div>
              <div className="text-2xl font-black">{formatMoney(metrics.total_value)}</div>
            </div>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-white shadow border-b">
        {/* Category columns: items stacked under small labels — everything visible, organized by task */}
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-x-6 gap-y-3 justify-center sm:justify-start">
          {navGroups.map(g => (
            <div key={g.label} className="flex flex-col gap-0.5 min-w-[130px]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-2 mb-0.5">{g.label}</div>
              {g.items.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-2 py-1 text-sm font-medium whitespace-nowrap rounded-lg text-left transition-colors ${
                    tab === t.id ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-green-50 hover:text-green-700'
                  }`}>
                  <span className="mr-1.5">{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>

      {/* Season Selector + Filters — only on analysis tabs; entry screens keep the full viewport */}
      {['overview', 'donors', 'products', 'trends', 'yoy', 'donations'].includes(tab) && (
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-3 items-center">
          <span className="text-sm font-semibold text-gray-500">Season:</span>
          <select value={selectedYear || 'all'}
            onChange={e => { setSelectedYear(e.target.value === 'all' ? null : parseInt(e.target.value)); setFilterFrom(''); setFilterTo('') }}
            className="px-3 py-1.5 border-2 border-green-400 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-green-400 bg-white">
            <option value="all">All Time</option>
            {seasons.map(s => <option key={s.year} value={s.year}>{s.year} Season</option>)}
          </select>
          <span className="text-gray-300 mx-1">|</span>
          <span className="text-sm font-semibold text-gray-500">Filters:</span>
          <input type="text" placeholder="Donor name..." value={filterDonor}
            onChange={e => setFilterDonor(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-400 w-40" />
          <input type="text" placeholder="Product..." value={filterProduct}
            onChange={e => setFilterProduct(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-400 w-40" />
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-400" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-400" />
          {hasFilters && (
            <button onClick={() => { setFilterDonor(''); setFilterProduct(''); setFilterFrom(''); setFilterTo('') }}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">Clear</button>
          )}
        </div>
      </div>
      )}

      {/* Error */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
            <strong>Connection Error:</strong> {error}. Make sure the backend API is running at <code className="bg-red-100 px-1 rounded">{API_URL}</code>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && !metrics && (
        <div className="flex justify-center items-center py-20">
          <div className="text-center">
            <div className="text-5xl mb-4 animate-bounce">🌱</div>
            <p className="text-gray-500 text-lg">Loading dashboard...</p>
          </div>
        </div>
      )}

      {/* Content */}
      {!error && (metrics || !loading) && (
        <main className="max-w-7xl mx-auto">
          <ErrorBoundary key={tab}>
          {tab === 'overview' && <OverviewTab metrics={metrics} donorStats={donorStats} productStats={productStats} />}
          {tab === 'donors' && <PinGate unlocked={pinUnlocked} onUnlock={() => setPinUnlocked(true)}><DonorsTab donorStats={donorStats} onChanged={loadData} /></PinGate>}
          {tab === 'products' && <ProductsTab productStats={productStats} />}
          {tab === 'trends' && <TrendsTab donations={donations} />}
          {tab === 'yoy' && <YearOverYearTab seasons={seasons} yoyData={yoyData} />}
          {tab === 'donations' && <PinGate unlocked={pinUnlocked} onUnlock={() => setPinUnlocked(true)}><DonationsTab donations={donations} products={products} donors={donors} onChanged={() => { loadData(); refreshSeasons() }} /></PinGate>}
          {tab === 'add' && <PinGate unlocked={pinUnlocked} onUnlock={() => setPinUnlocked(true)}><AddDonationTab products={products} donors={donors} onAdded={() => { loadData(); refreshSeasons() }} /></PinGate>}
          {tab === 'distributions' && <PinGate unlocked={pinUnlocked} onUnlock={() => setPinUnlocked(true)}><DistributionsTab products={products} onChanged={loadData} /></PinGate>}
          {tab === 'reports' && <PinGate unlocked={pinUnlocked} onUnlock={() => setPinUnlocked(true)}><ReportsTab seasons={seasons} donors={donors} /></PinGate>}
          {tab === 'archive' && <ReportArchiveTab />}
          {tab === 'manage' && <PinGate unlocked={pinUnlocked} onUnlock={() => setPinUnlocked(true)}><ManageProductsTab products={products} onUpdated={loadData} seasons={seasons} /></PinGate>}
          {tab === 'about' && <AboutTab />}
          </ErrorBoundary>
        </main>
      )}

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 text-center text-sm py-6 mt-12">
        <p>Grow-A-Row Impact Dashboard &middot; Fighting Food Insecurity One Tomato at a Time</p>
        {metrics?.date_range_start && <p className="mt-1 text-gray-500">Data: {new Date(metrics.date_range_start + 'T12:00:00').toLocaleDateString()} &ndash; {new Date(metrics.date_range_end + 'T12:00:00').toLocaleDateString()}</p>}
      </footer>
    </div>
  )
}
