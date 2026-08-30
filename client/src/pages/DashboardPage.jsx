import { Link } from 'react-router-dom';
import { Ticket, CircleDot, Clock, Hourglass, CheckCircle2, AlertTriangle, Activity, ArrowRight, Plus } from 'lucide-react';
import { useDashboardStats, useAgentWorkload } from '../hooks/useDashboard';
import { useTickets } from '../hooks/useTickets';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import StatusBadge from '../components/tickets/StatusBadge';
import PriorityBadge from '../components/tickets/PriorityBadge';
import { formatDateTime } from '../utils/format';

const STATUS_ORDER = ['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITY_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function statCardsForRole(role) {
  const totalLabel = role === 'USER' ? 'My Total Tickets' : role === 'AGENT' ? 'Assigned to Me' : 'Total Tickets';
  return [
    { key: 'total', label: totalLabel, icon: Ticket, accent: 'bg-brand-50 text-brand-600' },
    { key: 'OPEN', label: 'Open', icon: CircleDot, accent: 'bg-blue-50 text-blue-600', fromStatus: true },
    { key: 'IN_PROGRESS', label: 'In Progress', icon: Clock, accent: 'bg-amber-50 text-amber-600', fromStatus: true },
    { key: 'PENDING', label: 'Pending', icon: Hourglass, accent: 'bg-purple-50 text-purple-600', fromStatus: true },
    { key: 'RESOLVED', label: 'Resolved', icon: CheckCircle2, accent: 'bg-green-50 text-green-600', fromStatus: true },
    { key: 'URGENT', label: 'Urgent', icon: AlertTriangle, accent: 'bg-red-50 text-red-600', fromPriority: true },
  ];
}

function DistributionBar({ label, count, total, colorClass }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-500">
        <span>{label.replace('_', ' ')}</span>
        <span>{count}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AgentWorkloadSection() {
  const { data: workload, isLoading, isError } = useAgentWorkload();

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message="Couldn't load agent workload." />;
  if (!workload?.length) return <p className="py-4 text-center text-sm text-gray-400">No active agents yet.</p>;

  return (
    <div className="space-y-4">
      {workload.map(({ agent, total, byStatus }) => (
        <div key={agent.id} className="rounded-lg border border-gray-100 p-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">{agent.name}</p>
            <p className="text-xs text-gray-500">{total} assigned ticket{total === 1 ? '' : 's'}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-gray-500">
            {STATUS_ORDER.map((s) =>
              byStatus[s] ? (
                <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5">
                  {s.replace('_', ' ')}: {byStatus[s]}
                </span>
              ) : null
            )}
            {total === 0 && <span className="text-gray-400">No tickets assigned</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { role, user } = useAuth();
  const { data: stats, isLoading, isError } = useDashboardStats();
  // "Recent tickets" for USER/ADMIN pulls the general list; for AGENT it's
  // scoped to their own assignments so it matches the rest of their dashboard.
  const { data: recentTickets } = useTickets(
    role === 'AGENT' ? { page: 1, limit: 5, assignedToId: user?.id } : { page: 1, limit: 5 }
  );
  const { data: urgentTickets } = useTickets({ page: 1, limit: 4, priority: 'URGENT' });

  if (isLoading) return <Spinner />;
  if (isError || !stats) return <ErrorState message="Couldn't load dashboard stats." />;

  const STAT_CARDS = statCardsForRole(role);
  const showActivityFeed = role === 'AGENT' || role === 'ADMIN';

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden bg-gradient-to-br from-white via-white to-brand-50/70 p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow text-brand-700">HelpDesk overview</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0]}</h1>
            <p className="mt-1 text-sm text-slate-600">Here’s what needs attention today.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Link to="/tickets/new" className="btn bg-brand-600 px-4 py-2 text-white shadow-sm shadow-brand-600/30 hover:bg-brand-700"><Plus className="h-4 w-4" /> New ticket</Link><Link to={role === 'AGENT' ? '/my-tickets' : '/tickets'} className="btn border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50">My tickets</Link>{role === 'ADMIN' && <Link to="/users" className="btn border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50">Users</Link>}</div>
        </div>
      </section>

      <div>
        <p className="eyebrow mb-3">At a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STAT_CARDS.map(({ key, label, icon: Icon, accent, fromStatus, fromPriority }) => {
          const value = key === 'total'
            ? stats.total
            : fromStatus
            ? stats.byStatus[key] || 0
            : fromPriority
            ? stats.byPriority[key] || 0
            : 0;
          return (
            <div key={key} className="card p-4 transition-shadow hover:shadow-md">
              <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
                <Icon className="h-4.5 w-4.5" />
              </div>
              <p className="text-2xl font-semibold text-slate-950">{value}</p>
              <p className="text-xs font-medium text-slate-500">{label}</p>
            </div>
          );
        })}
      </div>

      {(role === 'ADMIN' || role === 'AGENT') && <section><div className="mb-3 flex items-center justify-between"><p className="eyebrow">Attention required</p><Link to="/tickets" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800">View all tickets <ArrowRight className="h-3.5 w-3.5" /></Link></div><div className="grid gap-4 lg:grid-cols-2"><div className="card p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">Urgent tickets</h2><p className="mt-0.5 text-xs text-slate-500">Issues that need a rapid response</p></div><AlertTriangle className="h-5 w-5 text-red-500" /></div>{urgentTickets?.tickets?.length ? <ul className="space-y-2">{urgentTickets.tickets.map((ticket) => <li key={ticket.id}><Link className="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-slate-50" to={`/tickets/${ticket.id}`}><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{ticket.title}</span><span className="text-xs text-slate-500">{ticket.assignedTo?.name || 'Unassigned'}</span></span><PriorityBadge priority={ticket.priority} /></Link></li>)}</ul> : <p className="rounded-xl bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-800">✓ No urgent tickets right now.</p>}</div><div className="card p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">Work in progress</h2><p className="mt-0.5 text-xs text-slate-500">Your active support queue</p></div><Clock className="h-5 w-5 text-amber-500" /></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-semibold text-slate-900">{stats.byStatus.IN_PROGRESS || 0}</p><p className="text-xs text-slate-500">In progress</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-semibold text-slate-900">{stats.byStatus.PENDING || 0}</p><p className="text-xs text-slate-500">Pending</p></div></div></div></div></section>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Status distribution */}
        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            {role === 'USER' ? 'My Tickets by Status' : role === 'AGENT' ? 'My Assigned by Status' : 'Tickets by Status'}
          </h2>
          <div className="space-y-3">
            {STATUS_ORDER.map((s) => (
              <DistributionBar key={s} label={s} count={stats.byStatus[s] || 0} total={stats.total} colorClass="bg-brand-500" />
            ))}
          </div>
        </div>

        {/* Priority distribution */}
        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            {role === 'USER' ? 'My Tickets by Priority' : role === 'AGENT' ? 'My Assigned by Priority' : 'Tickets by Priority'}
          </h2>
          <div className="space-y-3">
            {PRIORITY_ORDER.map((p) => (
              <DistributionBar
                key={p}
                label={p}
                count={stats.byPriority[p] || 0}
                total={stats.total}
                colorClass={p === 'URGENT' ? 'bg-red-500' : p === 'HIGH' ? 'bg-orange-500' : 'bg-blue-400'}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent tickets */}
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              {role === 'AGENT' ? 'Recent Tickets Assigned to Me' : 'Recent Tickets'}
            </h2>
            <Link to={role === 'AGENT' ? '/my-tickets' : '/tickets'} className="text-xs font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          {recentTickets?.tickets?.length ? (
            <ul className="divide-y divide-gray-100">
              {recentTickets.tickets.map((t) => (
                <li key={t.id}>
                  <Link to={`/tickets/${t.id}`} className="flex items-center justify-between py-2.5 text-sm hover:text-brand-700">
                    <span className="truncate pr-3 font-medium text-gray-800">{t.title}</span>
                    <StatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-gray-400">No tickets yet.</p>
          )}
        </div>

        {/* Activity feed: org-wide for Admin/User's own tickets, personal for Agent */}
        <div className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Activity className="h-4 w-4 text-gray-400" />
            {role === 'AGENT' ? 'My Activity' : 'Recent Activity'}
          </h2>
          {(() => {
            const feed = showActivityFeed && stats.myActivity ? stats.myActivity : stats.recentActivity;
            if (!feed?.length) return <p className="py-4 text-center text-sm text-gray-400">No recent activity.</p>;
            return (
              <ul className="space-y-3">
                {feed.map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <p className="text-gray-700">{entry.description}</p>
                    <p className="text-xs text-gray-400">
                      {entry.ticket?.title} · {formatDateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      </div>

      {role === 'ADMIN' && (
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Agent Workload</h2>
          <AgentWorkloadSection />
        </div>
      )}
    </div>
  );
}
