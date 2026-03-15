import { useState, useMemo, useEffect, useCallback } from 'react'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const APP_PIN = import.meta.env.VITE_APP_PIN || '2025'
const COLORS = ['#16a34a','#2563eb','#d97706','#dc2626','#7c3aed','#db2777','#0d9488','#ea580c','#4f46e5','#059669']

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

function formatMoney(n) { return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatNum(n) { return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }) }

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
            <div className="text-gray-400 text-sm">2.5 servings per pound</div>
          </div>
          <div>
            <div className="text-5xl font-black text-green-700">{metrics.meals_funded?.toLocaleString()}</div>
            <div className="text-gray-600 mt-2 text-lg">Meals Funded</div>
            <div className="text-gray-400 text-sm">Based on $3 per meal</div>
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
function DonorsTab({ donorStats }) {
  const cols = [
    { key: 'donor_name', label: 'Donor', bold: true },
    { key: 'total_value', label: 'Total Value', right: true, green: true, fmt: v => formatMoney(v) },
    { key: 'total_weight', label: 'Weight (lbs)', right: true, fmt: v => formatNum(v) },
    { key: 'total_donations', label: '# Donations', right: true },
    { key: 'unique_products', label: '# Products', right: true },
    { key: 'avg', label: 'Avg/Donation', right: true, fmt: (_, row) => formatMoney(row.total_value / row.total_donations) },
  ]
  return (
    <div className="p-6">
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="bg-green-600 text-white px-6 py-4"><h2 className="text-xl font-bold">All Donors ({donorStats.length})</h2></div>
        <SortableTable columns={cols} data={donorStats} pageSize={50} />
      </div>
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
      const dt = new Date(d.donation_date)
      const sun = new Date(dt); sun.setDate(dt.getDate() - dt.getDay())
      const key = sun.toISOString().slice(0, 10)
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
function DonationsTab({ donations }) {
  const cols = [
    { key: 'donation_date', label: 'Date', fmt: v => new Date(v + 'T12:00:00').toLocaleDateString() },
    { key: 'donor_name', label: 'Donor', bold: true },
    { key: 'product_name', label: 'Product' },
    { key: 'weight', label: 'Weight (lbs)', right: true, fmt: v => formatNum(v) },
    { key: 'price_per_lb', label: 'Price/lb', right: true, fmt: v => formatMoney(v) },
    { key: 'total_value', label: 'Value', right: true, green: true, fmt: v => formatMoney(v) },
  ]
  return (
    <div className="p-6">
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="bg-gray-700 text-white px-6 py-4"><h2 className="text-xl font-bold">All Donations ({donations.length})</h2></div>
        <SortableTable columns={cols} data={donations} pageSize={25} />
      </div>
    </div>
  )
}

// ─── Add Donation Tab ───────────────────────────────────────────────────────
function AddDonationTab({ products, onAdded }) {
  const [form, setForm] = useState({ donor_name: '', product_name: '', weight: '', donation_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const selectedProduct = products.find(p => p.name === form.product_name)
  const calcValue = selectedProduct && form.weight ? (parseFloat(form.weight) * selectedProduct.price_per_lb).toFixed(2) : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.donor_name || !form.product_name || !form.weight) {
      setMessage({ type: 'error', text: 'Please fill in all required fields.' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      await api('/donations', {
        method: 'POST',
        body: JSON.stringify({ ...form, weight: parseFloat(form.weight) }),
      })
      setMessage({ type: 'success', text: `Donation recorded! ${form.weight} lbs of ${form.product_name} from ${form.donor_name} (${formatMoney(calcValue)})` })
      setForm({ donor_name: '', product_name: '', weight: '', donation_date: new Date().toISOString().slice(0, 10), notes: '' })
      onAdded()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
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
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Donor Name *</label>
            <input type="text" value={form.donor_name}
              onChange={e => setForm({ ...form, donor_name: e.target.value })}
              className="w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              placeholder="e.g. Kathy Stott" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Product *</label>
            <select value={form.product_name}
              onChange={e => setForm({ ...form, product_name: e.target.value })}
              className="w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white">
              <option value="">Select produce type...</option>
              {products.map(p => <option key={p.id} value={p.name}>{p.name} — {formatMoney(p.price_per_lb)}/lb</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Weight (lbs) *</label>
            <input type="number" step="0.01" min="0" value={form.weight}
              onChange={e => setForm({ ...form, weight: e.target.value })}
              className="w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Date *</label>
            <input type="date" value={form.donation_date}
              onChange={e => setForm({ ...form, donation_date: e.target.value })}
              className="w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none" />
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
              <div className="flex justify-between"><span>Price per pound:</span><span className="font-semibold">{formatMoney(selectedProduct.price_per_lb)}</span></div>
              <div className="flex justify-between mt-2 text-xl"><span className="font-bold">Calculated Value:</span><span className="font-black text-green-700">{formatMoney(calcValue)}</span></div>
            </div>
          )}

          <button type="submit" disabled={saving}
            className="w-full py-4 rounded-lg font-bold text-lg text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 transition-colors">
            {saving ? 'Saving...' : 'Record Donation'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Manage Products Tab ────────────────────────────────────────────────────
function ManageProductsTab({ products, onUpdated }) {
  const [newProduct, setNewProduct] = useState({ name: '', price_per_lb: '', category: 'Vegetable' })
  const [message, setMessage] = useState(null)

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
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    }
  }

  const cols = [
    { key: 'name', label: 'Product', bold: true },
    { key: 'price_per_lb', label: 'Price/lb', right: true, green: true, fmt: v => formatMoney(v) },
    { key: 'category', label: 'Category' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-xl shadow p-6 max-w-lg mx-auto">
        <h3 className="text-lg font-bold mb-4">Add New Product</h3>
        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{message.text}</div>
        )}
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
      </div>
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="bg-amber-600 text-white px-6 py-4"><h2 className="text-xl font-bold">Price Lookup Table ({products.length} products)</h2></div>
        <SortableTable columns={cols} data={products} pageSize={50} />
      </div>
    </div>
  )
}

// ─── Year-Over-Year Tab ─────────────────────────────────────────────────────
function YearOverYearTab({ seasons, yoyData }) {
  if (!seasons || seasons.length === 0) return <p className="p-6 text-gray-500">No season data available yet.</p>

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

// ─── About This App Tab ──────────────────────────────────────────────────
function AboutTab() {
  const stats = {
    totalLines: 1830,
    files: 11,
    languages: [
      { name: 'Python', lines: 716, color: '#3572A5', usage: 'Backend API, data import scripts' },
      { name: 'JavaScript (JSX)', lines: 932, color: '#f7df1e', usage: 'Frontend UI, interactive dashboard' },
      { name: 'SQL', lines: 109, color: '#e38c00', usage: 'Database schema, indexes, seed data' },
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
      model: 'Claude Opus 4',
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
        <p className="text-green-600 mt-2 text-lg">Fighting Food Insecurity One Pound at a Time</p>
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
            <div className="text-3xl font-black text-green-600">15+</div>
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

  if (unlocked) return children

  const handleSubmit = (e) => {
    e.preventDefault()
    if (pin === APP_PIN) {
      onUnlock()
      setError(false)
    } else {
      setError(true)
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
            Incorrect PIN. Please try again.
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
          <button type="submit"
            className="w-full py-3 rounded-lg font-bold text-white bg-green-600 hover:bg-green-700 transition-colors">
            Unlock
          </button>
        </form>
        <p className="text-gray-400 text-xs mt-4">Contact your Grow-A-Row coordinator for the PIN.</p>
      </div>
    </div>
  )
}

// ─── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('overview')
  const [metrics, setMetrics] = useState(null)
  const [donorStats, setDonorStats] = useState([])
  const [productStats, setProductStats] = useState([])
  const [donations, setDonations] = useState([])
  const [products, setProducts] = useState([])
  const [seasons, setSeasons] = useState([])
  const [yoyData, setYoyData] = useState(null)
  const [selectedYear, setSelectedYear] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pinUnlocked, setPinUnlocked] = useState(false)

  const [filterDonor, setFilterDonor] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

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
      if (filterDonor) params.set('donor_name', filterDonor)
      if (filterProduct) params.set('product_name', filterProduct)

      if (!filterFrom && !filterTo && selectedYear) {
        params.set('start_date', `${selectedYear}-01-01`)
        params.set('end_date', `${selectedYear}-12-31`)
      } else {
        if (filterFrom) params.set('start_date', filterFrom)
        if (filterTo) params.set('end_date', filterTo)
      }
      const qs = params.toString() ? '?' + params.toString() : ''
      const yearParam = selectedYear && !filterFrom && !filterTo ? `?year=${selectedYear}` : ''

      const [m, ds, ps, d, pr] = await Promise.all([
        api('/metrics' + qs),
        api('/stats/donors/by-year' + yearParam),
        api('/stats/products/by-year' + yearParam),
        api('/donations' + qs),
        api('/products'),
      ])
      setMetrics(m)
      setDonorStats(ds)
      setProductStats(ps)
      setDonations(d)
      setProducts(pr)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filterDonor, filterProduct, filterFrom, filterTo, selectedYear])

  useEffect(() => { if (selectedYear !== null || selectedYear === null) loadData() }, [loadData])

  const refreshSeasons = () => {
    api('/seasons').then(setSeasons).catch(() => {})
    api('/stats/year-over-year').then(setYoyData).catch(() => {})
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'donors', label: 'Donors', icon: '👥' },
    { id: 'products', label: 'Products', icon: '🥬' },
    { id: 'trends', label: 'Trends', icon: '📈' },
    { id: 'yoy', label: 'Year over Year', icon: '📅' },
    { id: 'donations', label: 'All Donations', icon: '📋' },
    { id: 'add', label: 'Add Donation', icon: '➕' },
    { id: 'manage', label: 'Manage Products', icon: '⚙️' },
    { id: 'about', label: 'About', icon: 'ℹ️' },
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
        <div className="max-w-7xl mx-auto px-4 flex overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-3 transition-colors ${
                tab === t.id ? 'text-green-700 border-green-600 border-b-2' : 'text-gray-500 border-transparent hover:text-green-600'
              }`}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Season Selector + Filters */}
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
      {!loading && !error && (
        <main className="max-w-7xl mx-auto">
          {tab === 'overview' && <OverviewTab metrics={metrics} donorStats={donorStats} productStats={productStats} />}
          {tab === 'donors' && <DonorsTab donorStats={donorStats} />}
          {tab === 'products' && <ProductsTab productStats={productStats} />}
          {tab === 'trends' && <TrendsTab donations={donations} />}
          {tab === 'yoy' && <YearOverYearTab seasons={seasons} yoyData={yoyData} />}
          {tab === 'donations' && <DonationsTab donations={donations} />}
          {tab === 'add' && <PinGate unlocked={pinUnlocked} onUnlock={() => setPinUnlocked(true)}><AddDonationTab products={products} onAdded={() => { loadData(); refreshSeasons() }} /></PinGate>}
          {tab === 'manage' && <PinGate unlocked={pinUnlocked} onUnlock={() => setPinUnlocked(true)}><ManageProductsTab products={products} onUpdated={loadData} /></PinGate>}
          {tab === 'about' && <AboutTab />}
        </main>
      )}

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 text-center text-sm py-6 mt-12">
        <p>Grow-A-Row Impact Dashboard &middot; Fighting Food Insecurity One Pound at a Time</p>
        {metrics?.date_range_start && <p className="mt-1 text-gray-500">Data: {new Date(metrics.date_range_start + 'T12:00:00').toLocaleDateString()} &ndash; {new Date(metrics.date_range_end + 'T12:00:00').toLocaleDateString()}</p>}
      </footer>
    </div>
  )
}
