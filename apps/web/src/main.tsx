import React, {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FilePlus2,
  FileSpreadsheet,
  Handshake,
  LockKeyhole,
  LogOut,
  Moon,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Plus,
  Save,
  Search,
  Sun,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  purchaseRequestSchema,
  type PurchaseRequestInput,
} from "@compras/shared";
import type { z } from "zod";
import { useDebouncedValue } from "./use-debounced-value";
import "./index.css";

const Stock = lazy(() =>
  import("./stock").then((module) => ({ default: module.Stock })),
);
const Purchases = lazy(() =>
  import("./purchases").then((module) => ({ default: module.Purchases })),
);
const ProductRegistrationRequests = lazy(() =>
  import("./product-registration-requests").then((module) => ({
    default: module.ProductRegistrationRequests,
  })),
);
const Suppliers = lazy(() =>
  import("./suppliers").then((module) => ({ default: module.Suppliers })),
);
const MaterialWithdrawals = lazy(() =>
  import("./material-withdrawals").then((module) => ({
    default: module.MaterialWithdrawals,
  })),
);
const Users = lazy(() =>
  import("./users").then((module) => ({ default: module.Users })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok)
    throw Object.assign(new Error("Falha na operação"), {
      status: response.status,
      detail: await response.json().catch(() => null),
    });
  return response.json();
}

type CurrentUser = {
  id: string;
  name: string;
  login: string;
  role: string;
  jobTitle?: string;
  mustChangePassword: boolean;
};
const AuthContext = createContext<{
  user: CurrentUser;
  logout: () => Promise<void>;
} | null>(null);
const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthContext ausente");
  return context;
};

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("erm-theme", next ? "dark" : "light");
    setDark(next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className={`theme-toggle ${compact ? "h-9 px-2.5" : "h-10 px-3"}`}
      title={dark ? "Usar modo claro" : "Usar modo noturno"}
      aria-label={dark ? "Ativar modo claro" : "Ativar modo noturno"}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      {!compact && <span>{dark ? "Modo claro" : "Modo noturno"}</span>}
    </button>
  );
}

function Login() {
  const nav = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form)),
      });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      nav("/");
    } catch {
      setError(
        "Usuário ou senha inválidos. Verifique os dados e tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="relative min-h-screen bg-[#061326] lg:grid lg:grid-cols-[1.12fr_.88fr]">
      <div className="absolute right-5 top-5 z-20">
        <ThemeToggle />
      </div>
      <section className="relative hidden overflow-hidden p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(29,78,216,.4),transparent_38%),radial-gradient(circle_at_88%_85%,rgba(14,165,233,.2),transparent_35%)]" />
        <div className="absolute -bottom-32 -left-20 h-80 w-[120%] rotate-[-6deg] rounded-[50%] border border-blue-400/15 bg-blue-500/5" />
        <div className="brand-surface relative inline-flex w-fit items-center rounded-2xl bg-white px-5 py-3 shadow-xl shadow-black/20">
          <img
            src="/erm-logo.png"
            alt="Estaleiro Rio Maguari"
            className="h-14 w-auto object-contain"
          />
        </div>
        <div className="relative max-w-2xl">
          <span className="mb-5 inline-flex rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[.2em] text-blue-200">
            ERM · Operação integrada
          </span>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-tight">
            Suprimentos que acompanham o ritmo do estaleiro.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
            Solicitações, compras, recebimentos e estoque conectados em uma
            operação segura e rastreável.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 text-sm text-slate-300">
            {[
              "Solicitações multi-item",
              "Auditoria completa",
              "Controle de estoque",
              "Relatórios em Excel",
            ].map((item) => (
              <div className="flex items-center gap-2" key={item}>
                <CheckCircle2 size={17} className="text-blue-400" />
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-slate-500">
          Estaleiro Rio Maguari • Ambiente interno protegido
        </p>
      </section>
      <section className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10">
        <form onSubmit={submit} className="w-full max-w-md">
          <div className="mb-9 lg:hidden">
            <div className="brand-surface mb-5 inline-flex rounded-xl bg-white px-4 py-2">
              <img
                src="/erm-logo.png"
                alt="Estaleiro Rio Maguari"
                className="h-14 w-auto"
              />
            </div>
            <h1 className="text-2xl font-bold">Gestão de suprimentos ERM</h1>
          </div>
          <p className="text-sm font-semibold uppercase tracking-[.18em] text-blue-700">
            Acesso seguro
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Bem-vindo de volta
          </h2>
          <p className="mt-2 text-slate-500">
            Entre com as credenciais fornecidas pelo administrador.
          </p>
          <div className="mt-8 space-y-5">
            <label className="block text-sm font-semibold text-slate-700">
              Usuário
              <div className="relative mt-2">
                <UserRound
                  className="absolute left-3.5 top-3 text-slate-400"
                  size={19}
                />
                <input
                  name="login"
                  className="input h-12 pl-11"
                  autoComplete="username"
                  placeholder="Digite seu usuário"
                  required
                  autoFocus
                />
              </div>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Senha
              <div className="relative mt-2">
                <LockKeyhole
                  className="absolute left-3.5 top-3 text-slate-400"
                  size={19}
                />
                <input
                  name="password"
                  type="password"
                  className="input h-12 pl-11"
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  required
                />
              </div>
            </label>
          </div>
          {error && (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <button
            className="button mt-7 h-12 w-full text-base shadow-lg shadow-blue-700/20"
            disabled={loading}
          >
            {loading ? (
              "Entrando…"
            ) : (
              <>
                Entrar no sistema <ChevronRight size={19} />
              </>
            )}
          </button>
          <p className="mt-7 text-center text-xs text-slate-400">
            Problemas para acessar? Solicite a redefinição ao administrador.
          </p>
        </form>
      </section>
    </main>
  );
}

function ChangePassword() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password !== confirmation) {
      setError("A confirmação não corresponde à nova senha.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (cause) {
      const detail = (cause as { detail?: { message?: string | string[] } })
        .detail?.message;
      setError(
        Array.isArray(detail)
          ? detail.join(" ")
          : detail || "Não foi possível alterar a senha.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="bg-[#071b35] px-7 py-6 text-white">
          <img
            src="/erm-logo.png"
            alt="ERM"
            className="mb-5 h-12 rounded-lg bg-white px-3 py-2"
          />
          <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-300">
            Primeiro acesso
          </p>
          <h2 className="mt-2 text-2xl font-bold">Crie sua senha definitiva</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Por segurança, substitua a senha temporária antes de acessar o
            sistema.
          </p>
        </div>
        <div className="space-y-4 p-7">
          <label className="block text-sm font-semibold text-slate-700">
            Nova senha
            <input
              name="password"
              type="password"
              minLength={12}
              required
              autoFocus
              autoComplete="new-password"
              className="input mt-1.5"
              placeholder="Mínimo de 12 caracteres"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Confirmar nova senha
            <input
              name="confirmation"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
              className="input mt-1.5"
            />
          </label>
          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="button h-11 w-full" disabled={loading}>
            <LockKeyhole size={18} />{" "}
            {loading ? "Salvando…" : "Definir nova senha"}
          </button>
        </div>
      </form>
    </div>
  );
}

const links = [
  ["/", BarChart3, "Dashboard"],
  ["/nova", PackagePlus, "Nova solicitação"],
  ["/solicitacoes", ClipboardList, "Solicitações"],
  ["/fornecedores", Handshake, "Fornecedores"],
  ["/compras", PackageCheck, "Almoxarifado"],
  ["/retiradas", PackageMinus, "Retirada de Material"],
  ["/solicitar-cadastro", FilePlus2, "Solicitação de Cadastro"],
  ["/estoque", Boxes, "Estoque"],
  ["/produtos", Boxes, "Itens / Produtos"],
  ["/relatorios", FileSpreadsheet, "Relatórios"],
  ["/usuarios", UsersRound, "Usuários"],
] as const;
function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="bg-slate-950 p-5 text-slate-200">
        <div className="mb-7 border-b border-slate-800 pb-6">
          <div className="brand-surface rounded-xl bg-white px-4 py-3 shadow-lg shadow-black/20">
            <img
              src="/erm-logo.png"
              alt="Estaleiro Rio Maguari"
              className="mx-auto h-12 w-auto object-contain"
            />
          </div>
          <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">
            Gestão de suprimentos
          </p>
        </div>
        <nav className="space-y-1">
          {links.map(([to, Icon, label]) =>
            (to === "/solicitar-cadastro" &&
              !["ADMIN", "ALMOXARIFADO"].includes(user.role)) ||
            (to === "/fornecedores" &&
              !["ADMIN", "COMPRAS"].includes(user.role)) ||
            (to === "/usuarios" && user.role !== "ADMIN") ||
            (to === "/retiradas" && user.role === "CONSULTA") ? null : (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive ? "bg-blue-700 text-white" : "hover:bg-slate-800"}`
                }
              >
                <Icon size={18} />
                {to === "/nova" && user.role === "COMPRAS"
                  ? "Pedidos recebidos"
                  : label}
              </NavLink>
            ),
          )}
        </nav>
      </aside>
      <section className="min-w-0">
        <header className="flex h-16 items-center justify-between border-b bg-white px-4 sm:px-7">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <Building2 size={17} />
              Gestão de suprimentos ERM
            </span>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
              v0.4 edição
            </span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle compact />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-5 text-slate-800">
                {user.name}
              </p>
              <p className="text-[11px] font-medium uppercase leading-4 tracking-wide text-slate-400">
                {user.role}
              </p>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        </header>
        <main className="min-w-0 p-4 sm:p-7">{children}</main>
      </section>
    </div>
  );
}

function Dashboard() {
  type DashboardData = {
    totals: {
      requests: number;
      items: number;
      products: number;
      pendingItems: number;
      overdueItems: number;
      lowStock: number;
      orders: number;
      orderValue: number;
      fulfillmentRate: number;
    };
    statuses: Array<{
      id: string;
      code: string;
      label: string;
      color: string;
      terminal: boolean;
      count: number;
    }>;
    criticality: Array<{ label: string; count: number }>;
    monthly: Array<{ month: number; requests: number; items: number }>;
    recentRequests: Array<{
      id: string;
      number: string;
      requestDate: string;
      requesterOriginal?: string;
      createdBy: { name: string };
      aggregateStatus: string;
      department?: { name: string };
      items: number;
    }>;
    updatedAt: string;
  };
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/dashboard"),
  });
  if (isLoading || !data)
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="mt-3 text-sm text-slate-500">Preparando indicadores…</p>
        </div>
      </div>
    );
  const maxMonth = Math.max(1, ...data.monthly.map((month) => month.items));
  const totalStatus = Math.max(
    1,
    data.statuses.reduce((sum, status) => sum + status.count, 0),
  );
  let angle = 0;
  const donut = `conic-gradient(${data.statuses
    .map((status) => {
      const start = angle;
      angle += (status.count / totalStatus) * 360;
      return `${status.color || "#64748b"} ${start}deg ${angle}deg`;
    })
    .join(",")})`;
  const months = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  const statusColor = (label: string) =>
    data.statuses.find((status) => status.label === label)?.color || "#64748b";
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-32 w-32 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-blue-300">
              <TrendingUp size={15} /> Painel operacional
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Visão geral de compras
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Acompanhe solicitações, atendimento e pontos críticos da operação
              em tempo real.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to="/nova"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500"
            >
              <Plus size={17} /> Nova solicitação
            </Link>
            <Link
              to="/relatorios"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold hover:bg-white/10"
            >
              <FileSpreadsheet size={17} /> Exportar
            </Link>
          </div>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Solicitações",
            value: data.totals.requests,
            detail: `${data.totals.items} itens no total`,
            icon: ClipboardList,
            color: "blue",
            to: "/solicitacoes",
          },
          {
            label: "Itens pendentes",
            value: data.totals.pendingItems,
            detail: "Aguardando conclusão",
            icon: Clock3,
            color: "amber",
            to: "/solicitacoes?status=pendente",
          },
          {
            label: "Taxa de atendimento",
            value: `${data.totals.fulfillmentRate}%`,
            detail: `${data.totals.orders} ordens de compra`,
            icon: PackageCheck,
            color: "green",
            to: "/solicitacoes",
          },
          {
            label: "Estoque em atenção",
            value: data.totals.lowStock,
            detail: `de ${data.totals.products} produtos ativos`,
            icon: AlertTriangle,
            color: "red",
            to: "/estoque?status=attention",
          },
        ].map((card) => (
          <Link
            to={card.to}
            key={card.label}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <span
                className={`grid h-11 w-11 place-items-center rounded-xl ${card.color === "blue" ? "bg-blue-50 text-blue-700" : card.color === "amber" ? "bg-amber-50 text-amber-700" : card.color === "green" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
              >
                <card.icon size={22} />
              </span>
              <ArrowUpRight
                size={17}
                className="text-slate-300 transition group-hover:text-blue-600"
              />
            </div>
            <p className="mt-5 text-sm font-medium text-slate-500">
              {card.label}
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              {card.value}
            </p>
            <p className="mt-2 text-xs text-slate-400">{card.detail}</p>
          </Link>
        ))}
      </section>
      {data.totals.overdueItems > 0 && (
        <Link
          to="/solicitacoes?status=ATRASADO"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-800"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-100">
              <AlertTriangle size={20} />
            </span>
            <div>
              <p className="font-bold">
                {data.totals.overdueItems} itens com atraso
              </p>
              <p className="text-sm text-red-600">
                Existem itens que precisam de acompanhamento prioritário.
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1 text-sm font-semibold">
            Ver solicitações <ChevronRight size={17} />
          </span>
        </Link>
      )}
      <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Volume mensal</h2>
              <p className="mt-1 text-xs text-slate-500">
                Itens solicitados em {new Date().getFullYear()}
              </p>
            </div>
            <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
              {data.monthly.reduce((sum, month) => sum + month.items, 0)} itens
            </span>
          </div>
          <div className="mt-7 flex h-56 items-end gap-2 sm:gap-3">
            {data.monthly.map((month) => (
              <div
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                key={month.month}
              >
                <div className="mb-2 opacity-0 transition group-hover:opacity-100 text-[10px] font-bold text-slate-700">
                  {month.items}
                </div>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-blue-700 to-blue-400 transition-all group-hover:from-blue-600 group-hover:to-cyan-400"
                  style={{
                    height: `${Math.max(month.items ? 8 : 2, (month.items / maxMonth) * 82)}%`,
                  }}
                />
                <span className="mt-2 text-[10px] font-medium text-slate-400 sm:text-xs">
                  {months[month.month]}
                </span>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h2 className="font-bold text-slate-900">
              Distribuição por status
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Situação atual dos itens
            </p>
          </div>
          <div className="mt-6 grid items-center gap-6 sm:grid-cols-[150px_1fr] xl:grid-cols-1 2xl:grid-cols-[150px_1fr]">
            <div
              className="relative mx-auto h-36 w-36 rounded-full"
              style={{ background: donut }}
            >
              <div className="absolute inset-5 grid place-items-center rounded-full bg-white text-center">
                <div>
                  <strong className="text-2xl text-slate-950">
                    {totalStatus}
                  </strong>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">
                    itens
                  </p>
                </div>
              </div>
            </div>
            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {data.statuses
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((status) => (
                  <div
                    className="flex items-center gap-2.5 text-xs"
                    key={status.id}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: status.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-slate-600">
                      {status.label}
                    </span>
                    <strong className="text-slate-900">{status.count}</strong>
                  </div>
                ))}
            </div>
          </div>
        </article>
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-bold text-slate-900">
                Solicitações recentes
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Últimos registros realizados
              </p>
            </div>
            <Link
              to="/solicitacoes"
              className="text-sm font-semibold text-blue-700 hover:text-blue-800"
            >
              Ver todas
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {data.recentRequests.map((request) => (
              <Link
                to={`/solicitacoes?q=${request.number}`}
                className="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50 sm:px-6"
                key={request.id}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-bold text-slate-700">
                  SC
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-blue-700">{request.number}</p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                      style={{
                        backgroundColor: statusColor(request.aggregateStatus),
                      }}
                    >
                      {request.aggregateStatus}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    Solicitante: {request.requesterOriginal || "Não informado"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    Registrado por: {request.createdBy.name}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold text-slate-700">
                    {request.items} itens
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Intl.DateTimeFormat("pt-BR").format(
                      new Date(request.requestDate),
                    )}
                  </p>
                </div>
                <ChevronRight size={17} className="text-slate-300" />
              </Link>
            ))}
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-bold text-slate-900">Criticidade dos itens</h2>
          <p className="mt-1 text-xs text-slate-500">Priorização da demanda</p>
          <div className="mt-6 space-y-5">
            {["ALTA", "MEDIA", "BAIXA"].map((label) => {
              const count =
                data.criticality.find((item) => item.label === label)?.count ||
                0;
              const maximum = Math.max(
                1,
                ...data.criticality.map((item) => item.count),
              );
              return (
                <div key={label}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700">
                      {label === "ALTA"
                        ? "Alta"
                        : label === "MEDIA"
                          ? "Média"
                          : "Baixa"}
                    </span>
                    <strong>{count}</strong>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${label === "ALTA" ? "bg-red-500" : label === "MEDIA" ? "bg-amber-400" : "bg-green-500"}`}
                      style={{ width: `${(count / maximum) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-7 rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Valor total em ordens</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">
              {data.totals.orderValue.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Somatório das ordens cadastradas
            </p>
          </div>
        </article>
      </section>
      <p className="pb-1 text-right text-[11px] text-slate-400">
        Atualizado em{" "}
        {new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(data.updatedAt))}
      </p>
    </div>
  );
}

type RequestStatusOption = {
  id: string;
  code: string;
  label: string;
  color: string;
  terminal: boolean;
};
type RequestDetailItem = {
  id: string;
  description: string;
  manualCode?: string;
  quantity: number;
  unit: string;
  version: number;
  product?: { code: string };
  status: { id: string; label: string; color?: string };
};
type RequestDetail = {
  id: string;
  number: string;
  requestDate: string;
  requesterOriginal?: string;
  createdBy: { name: string };
  aggregateStatus: string;
  notes?: string;
  version: number;
  items: RequestDetailItem[];
};
function Requests() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState("");
  const [criticality, setCriticality] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedStatusId, setSelectedStatusId] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: [
      "requests",
      debouncedQ,
      page,
      pageSize,
      status,
      criticality,
      sortDir,
    ],
    queryFn: () =>
      api<{
        data: Array<{
          id: string;
          number: string;
          requestDate: string;
          aggregateStatus: string;
          requesterOriginal?: string;
          createdBy: { name: string };
          department?: { name: string };
          items: unknown[];
        }>;
        total: number;
        pageSize: number;
      }>(
        `/requests?q=${encodeURIComponent(debouncedQ)}&page=${page}&pageSize=${pageSize}&status=${encodeURIComponent(status)}&criticality=${criticality}&sortDir=${sortDir}`,
      ),
    placeholderData: (previous) => previous,
  });
  const detail = useQuery({
    queryKey: ["request-detail", selectedId],
    queryFn: () => api<RequestDetail>(`/requests/${selectedId}`),
    enabled: !!selectedId,
  });
  const statuses = useQuery({
    queryKey: ["request-statuses"],
    queryFn: () => api<RequestStatusOption[]>("/requests/catalog/statuses"),
  });
  const [editNotes, setEditNotes] = useState("");
  useEffect(() => {
    if (detail.data) setEditNotes(detail.data.notes || "");
  }, [detail.data]);
  const saveRequest = useMutation({
    mutationFn: () => {
      if (!detail.data) throw new Error("Solicitação ainda não carregada");
      return api(`/requests/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: detail.data.version,
          notes: editNotes,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({
        queryKey: ["request-detail", selectedId],
      });
    },
  });
  const saveItemStatus = useMutation({
    mutationFn: () => {
      const item = detail.data?.items.find(
        (current) => current.id === editingItemId,
      );
      if (!item || !selectedId) throw new Error("Item não carregado");
      return api(`/requests/${selectedId}/items/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          statusId: selectedStatusId,
          version: item.version,
          note: statusNote,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({
        queryKey: ["request-detail", selectedId],
      });
      setEditingItemId(null);
      setStatusNote("");
    },
  });
  const pages = Math.max(1, Math.ceil((data?.total || 0) / pageSize));
  const statusAppearance = (label: string) => {
    const color =
      statuses.data?.find((current) => current.label === label)?.color ||
      "#64748b";
    return { color, backgroundColor: `${color}18`, borderColor: `${color}45` };
  };
  return (
    <>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Solicitações</h1>
          <p className="text-slate-500">
            {data?.total ?? 0} registros encontrados
          </p>
        </div>
        <Link to="/nova" className="button">
          <Plus size={17} />
          Nova solicitação
        </Link>
      </div>
      <div className="card overflow-hidden p-0">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(240px,1fr)_200px_160px_170px]">
          <label className="relative block">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={18}
            />
            <input
              className="input h-11 pl-10"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar SC ou descrição"
            />
          </label>
          <select
            className="input h-11"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os status</option>
            {[
              "AGUARDANDO AQUISIÇÃO",
              "EM NEGOCIAÇÃO",
              "PEDIDO REALIZADO",
              "EM TRANSPORTE",
              "ENTREGUE",
              "ATRASADO",
              "CANCELADO",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            className="input h-11"
            value={criticality}
            onChange={(e) => {
              setCriticality(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Criticidade</option>
            <option>BAIXA</option>
            <option>MEDIA</option>
            <option>ALTA</option>
          </select>
          <select
            className="input h-11"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value)}
          >
            <option value="desc">Mais recentes</option>
            <option value="asc">Mais antigas</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">SC</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Solicitante</th>
                <th className="px-4 py-3">Registrado por</th>
                <th className="px-4 py-3">Departamento</th>
                <th className="px-4 py-3 text-center">Itens</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="p-5" colSpan={8}>
                    Carregando…
                  </td>
                </tr>
              ) : (
                data?.data.map((r) => (
                  <tr
                    onClick={() => setSelectedId(r.id)}
                    className="cursor-pointer border-t hover:bg-blue-50/60"
                    key={r.id}
                  >
                    <td className="px-4 py-3.5 font-semibold text-blue-700">
                      {r.number}
                    </td>
                    <td className="px-4 py-3.5">
                      {new Intl.DateTimeFormat("pt-BR").format(
                        new Date(r.requestDate),
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {r.requesterOriginal || "—"}
                    </td>
                    <td className="px-4 py-3.5">{r.createdBy.name}</td>
                    <td className="px-4 py-3.5">{r.department?.name || "—"}</td>
                    <td className="px-4 py-3.5 text-center">
                      {r.items.length}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className="inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold"
                        style={statusAppearance(r.aggregateStatus)}
                      >
                        {r.aggregateStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedId(r.id);
                        }}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        Ver / Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span>Itens por página</span>
            <select
              className="rounded-lg border px-2 py-1.5"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span>
              Página {page} de {pages}
            </span>
            <button
              className="rounded-lg border px-3 py-1.5 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <button
              className="rounded-lg border px-3 py-1.5 disabled:opacity-40"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
      {selectedId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50">
          <div className="h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-50 flex items-center justify-between border-b bg-white p-5">
              <div>
                <p className="text-xs font-semibold uppercase text-blue-700">
                  Modo de visualização e edição
                </p>
                <h2 className="text-2xl font-bold">
                  SC {detail.data?.number || "…"}
                </h2>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X />
              </button>
            </div>
            {detail.isLoading ? (
              <p className="p-7">Carregando…</p>
            ) : (
              detail.data && (
                <div className="space-y-6 p-7">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                    <strong>Como editar:</strong> clique no botão “Alterar
                    status” do item, escolha o novo status e confirme em “Salvar
                    novo status”.
                  </div>
                  <div className="grid gap-4 rounded-xl bg-slate-50 p-5 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-500">Data</p>
                      <p className="font-semibold">
                        {new Intl.DateTimeFormat("pt-BR").format(
                          new Date(detail.data.requestDate),
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Solicitante</p>
                      <p className="font-semibold">
                        {detail.data.requesterOriginal || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Registrado por</p>
                      <p className="font-semibold">
                        {detail.data.createdBy.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Status geral</p>
                      <p className="font-semibold">
                        {detail.data.aggregateStatus}
                      </p>
                    </div>
                  </div>
                  <div>
                    <div className="mb-3">
                      <h3 className="font-bold">
                        Itens ({detail.data.items.length})
                      </h3>
                      <p className="text-sm text-slate-500">
                        Cada item possui status independente.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {detail.data.items.map((item) => (
                        <div
                          className={`rounded-xl border transition ${editingItemId === item.id ? "border-blue-400 bg-blue-50/40" : "hover:border-blue-300"}`}
                          key={item.id}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-4 p-4">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold">
                                {item.description}
                              </p>
                              <p className="text-sm text-slate-500">
                                {item.product?.code ||
                                  item.manualCode ||
                                  "Sem código"}{" "}
                                •{" "}
                                {Number(item.quantity).toLocaleString("pt-BR")}{" "}
                                {item.unit}
                              </p>
                            </div>
                            <span
                              className="h-fit whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                              style={{
                                backgroundColor: item.status.color || "#64748b",
                              }}
                            >
                              {item.status.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingItemId(
                                  editingItemId === item.id ? null : item.id,
                                );
                                setSelectedStatusId(item.status.id);
                                setStatusNote("");
                              }}
                              className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                            >
                              {editingItemId === item.id
                                ? "Cancelar edição"
                                : "Alterar status"}
                            </button>
                          </div>
                          {editingItemId === item.id && (
                            <div className="grid gap-3 border-t border-blue-200 bg-white p-4 md:grid-cols-[1fr_1.5fr_auto]">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Novo status
                                <select
                                  className="input mt-1.5 h-11 text-sm font-normal normal-case"
                                  value={selectedStatusId}
                                  onChange={(e) =>
                                    setSelectedStatusId(e.target.value)
                                  }
                                  disabled={statuses.isLoading}
                                >
                                  {statuses.isLoading ? (
                                    <option>Carregando status…</option>
                                  ) : (
                                    statuses.data?.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.label}
                                      </option>
                                    ))
                                  )}
                                </select>
                              </label>
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Observação da alteração
                                <input
                                  className="input mt-1.5 h-11 text-sm font-normal normal-case"
                                  value={statusNote}
                                  onChange={(e) =>
                                    setStatusNote(e.target.value)
                                  }
                                  placeholder="Opcional"
                                />
                              </label>
                              <div className="flex items-end">
                                <button
                                  className="button h-11"
                                  onClick={() => saveItemStatus.mutate()}
                                  disabled={
                                    !selectedStatusId ||
                                    saveItemStatus.isPending
                                  }
                                >
                                  <Save size={16} />
                                  {saveItemStatus.isPending
                                    ? "Salvando…"
                                    : "Salvar novo status"}
                                </button>
                              </div>
                              {saveItemStatus.isError && (
                                <p className="text-sm text-red-600 md:col-span-3">
                                  Não foi possível atualizar. Feche e abra a
                                  solicitação e tente novamente.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <label className="block text-sm font-semibold">
                    Observações gerais
                    <textarea
                      className="input mt-2 min-h-28"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                    />
                  </label>
                  <div className="flex items-center justify-end gap-3">
                    {saveRequest.isSuccess && (
                      <span className="text-sm font-medium text-green-700">
                        Observações salvas.
                      </span>
                    )}
                    <button
                      className="button"
                      onClick={() => saveRequest.mutate()}
                      disabled={saveRequest.isPending}
                    >
                      <Save size={17} />
                      {saveRequest.isPending
                        ? "Salvando…"
                        : "Salvar observações"}
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}

type Product = {
  id: string;
  code: string;
  genericDescription: string;
  type?: string;
  unit?: string;
  productGroup?: string;
  stockBalance: number;
  unitCost?: number;
  minimumStock?: number;
  projectCode?: string;
};
type ProductForm = {
  code: string;
  genericDescription: string;
  type?: string;
  unit: string;
  productGroup?: string;
  stockBalance: number;
  unitCost?: number;
  minimumStock?: number;
  projectCode?: string;
  ca?: string;
  note?: string;
};
function Products({ role }: { role: string }) {
  const canManage = role === "COMPRAS";
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [group, setGroup] = useState("");
  const [stock, setStock] = useState("");
  const [sortBy, setSortBy] = useState("genericDescription");
  const [sortDir, setSortDir] = useState("asc");
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("novo") === "1" && canManage) setOpen(true);
  }, [canManage, searchParams]);
  const closeForm = () => {
    setOpen(false);
    setEditing(null);
    reset({ unit: "UN", stockBalance: 0 });
    if (searchParams.has("novo")) {
      searchParams.delete("novo");
      setSearchParams(searchParams, { replace: true });
    }
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductForm>({ defaultValues: { unit: "UN", stockBalance: 0 } });
  const products = useQuery({
    queryKey: [
      "products",
      debouncedQ,
      page,
      pageSize,
      group,
      stock,
      sortBy,
      sortDir,
    ],
    queryFn: () =>
      api<{ data: Product[]; total: number }>(
        `/products?q=${encodeURIComponent(debouncedQ)}&page=${page}&limit=${pageSize}&group=${encodeURIComponent(group)}&stock=${stock}&sortBy=${sortBy}&sortDir=${sortDir}`,
      ),
    placeholderData: (previous) => previous,
  });
  const stockSummary = useQuery({
    queryKey: ["stock", "catalog-summary"],
    queryFn: () =>
      api<{ summary: { all: number; zero: number; below: number } }>("/stock"),
    refetchInterval: 30000,
  });
  const groups = [
    "EPI",
    "FERRAMENTAS",
    "ELÉTRICA",
    "SOLDA",
    "CONSUMÍVEIS",
    "MANUTENÇÃO",
    "UNIFORMES",
  ];
  const create = useMutation({
    mutationFn: (input: ProductForm) =>
      api<Product>(editing ? `/products/${editing.id}` : "/products", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ ...input, stockBalance: undefined }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      reset();
      closeForm();
    },
  });
  const openEdit = (product: Product) => {
    setEditing(product);
    reset({
      code: product.code,
      genericDescription: product.genericDescription,
      type: product.type,
      unit: product.unit || "UN",
      productGroup: product.productGroup,
      stockBalance: Number(product.stockBalance),
      unitCost: product.unitCost == null ? undefined : Number(product.unitCost),
      minimumStock:
        product.minimumStock == null ? undefined : Number(product.minimumStock),
      projectCode: product.projectCode,
    });
    setOpen(true);
  };
  const totalPages = Math.max(
    1,
    Math.ceil((products.data?.total || 0) / pageSize),
  );
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-blue-700">
            Catálogo mestre
          </p>
          <h1 className="mt-1 text-2xl font-bold">Itens / Produtos</h1>
          <p className="text-slate-500">
            Cadastre cada item antes de incluí-lo em uma solicitação de compra.
          </p>
        </div>
        {canManage && (
          <button className="button" onClick={() => setOpen(true)}>
            <Plus size={18} /> Cadastrar novo item
          </button>
        )}
      </div>
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        {[
          ["Produtos cadastrados", stockSummary.data?.summary.all ?? "—"],
          ["No mínimo ou abaixo", stockSummary.data?.summary.below ?? "—"],
          ["Sem estoque", stockSummary.data?.summary.zero ?? "—"],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="card overflow-hidden p-0">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(250px,1fr)_180px_170px_190px]">
          <label className="relative block">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={18}
            />
            <input
              className="input h-11 pl-10"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por código ou descrição"
            />
          </label>
          <select
            className="input h-11"
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os grupos</option>
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <select
            className="input h-11"
            value={stock}
            onChange={(e) => {
              setStock(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os saldos</option>
            <option value="zero">Estoque zerado</option>
            <option value="below">No mínimo ou abaixo</option>
          </select>
          <select
            className="input h-11"
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [field, direction] = e.target.value.split(":");
              setSortBy(field);
              setSortDir(direction);
            }}
          >
            <option value="genericDescription:asc">Descrição A–Z</option>
            <option value="genericDescription:desc">Descrição Z–A</option>
            <option value="code:asc">Código crescente</option>
            <option value="stockBalance:asc">Menor saldo</option>
            <option value="stockBalance:desc">Maior saldo</option>
            <option value="unitCost:desc">Maior custo</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] table-fixed text-sm">
            <colgroup>
              <col className="w-32" />
              <col />
              <col className="w-24" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-40" />
              <col className="w-32" />
            </colgroup>
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3.5">Código</th>
                <th className="px-4 py-3.5">Descrição</th>
                <th className="px-4 py-3.5">Unidade</th>
                <th className="px-4 py-3.5">Grupo</th>
                <th className="px-4 py-3.5 text-right">Saldo</th>
                <th className="px-4 py-3.5 text-right">Custo unitário</th>
                <th className="px-4 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {products.isLoading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500">
                    Carregando produtos…
                  </td>
                </tr>
              ) : (
                products.data?.data.map((p) => (
                  <tr
                    onClick={() => openEdit(p)}
                    className="cursor-pointer border-t hover:bg-blue-50/60"
                    key={p.id}
                  >
                    <td className="px-4 py-3.5 font-mono font-semibold text-blue-700">
                      {p.code}
                    </td>
                    <td className="px-4 py-3.5 font-medium leading-5">
                      <span className="block break-words">
                        {p.genericDescription}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {p.unit || "—"}
                    </td>
                    <td className="px-4 py-3.5 break-words">
                      {p.productGroup || "—"}
                    </td>
                    <td
                      className={`px-4 py-3.5 text-right font-semibold ${Number(p.stockBalance) === 0 ? "text-red-600" : "text-slate-700"}`}
                    >
                      {Number(p.stockBalance).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {p.unitCost == null
                        ? "—"
                        : Number(p.unitCost).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEdit(p);
                        }}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        {canManage ? "Ver / Editar" : "Ver item"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <span>Itens por página</span>
            <select
              className="rounded-lg border px-2 py-1.5"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span>
              Página {page} de {totalPages}
            </span>
            <button
              className="rounded-lg border px-3 py-1.5 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <button
              className="rounded-lg border px-3 py-1.5 disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit((v) => create.mutate(v))}
            className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-7 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  {editing
                    ? canManage
                      ? "Detalhes e edição"
                      : "Consulta do item"
                    : "Novo cadastro"}
                </p>
                <h2 className="text-xl font-bold">
                  {editing ? editing.genericDescription : "Cadastrar novo item"}
                </h2>
                <p className="text-sm text-slate-500">
                  {editing
                    ? canManage
                      ? "Altere os campos e salve para atualizar o produto."
                      : "Visualização somente leitura. Alterações são exclusivas do setor de Compras."
                    : "Após salvar, ele estará disponível nas solicitações."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X />
              </button>
            </div>
            <fieldset
              disabled={!canManage}
              className="grid gap-5 p-7 md:grid-cols-2 disabled:opacity-90"
            >
              <label className="text-sm font-semibold">
                Código do produto
                <input
                  className="input mt-2"
                  {...register("code", { required: "Informe o código" })}
                />
                {errors.code && (
                  <span className="text-xs text-red-600">
                    {errors.code.message}
                  </span>
                )}
              </label>
              <label className="text-sm font-semibold">
                Unidade
                <input
                  className="input mt-2 uppercase"
                  {...register("unit", { required: true })}
                />
              </label>
              <label className="text-sm font-semibold md:col-span-2">
                Descrição genérica
                <input
                  className="input mt-2"
                  {...register("genericDescription", {
                    required: "Informe a descrição",
                  })}
                />
                {errors.genericDescription && (
                  <span className="text-xs text-red-600">
                    {errors.genericDescription.message}
                  </span>
                )}
              </label>
              <label className="text-sm font-semibold">
                Tipo
                <input className="input mt-2" {...register("type")} />
              </label>
              <label className="text-sm font-semibold">
                Grupo
                <input className="input mt-2" {...register("productGroup")} />
              </label>
              <label className="text-sm font-semibold">
                Saldo atual
                <input
                  readOnly
                  className="input mt-2 bg-slate-100"
                  value={
                    editing
                      ? Number(editing.stockBalance).toLocaleString("pt-BR")
                      : "0"
                  }
                />
                <Link
                  to="/estoque"
                  className="mt-1 block text-xs text-blue-700"
                >
                  Movimente pelo módulo de estoque
                </Link>
              </label>
              <label className="text-sm font-semibold">
                Estoque mínimo
                <input
                  type="number"
                  step="0.001"
                  className="input mt-2"
                  {...register("minimumStock", { valueAsNumber: true, min: 0 })}
                />
              </label>
              <label className="text-sm font-semibold">
                Custo unitário
                <input
                  type="number"
                  step="0.0001"
                  className="input mt-2"
                  {...register("unitCost", { valueAsNumber: true })}
                />
              </label>
              <label className="text-sm font-semibold">
                Código do projeto
                <input className="input mt-2" {...register("projectCode")} />
              </label>
              <label className="text-sm font-semibold">
                C.A.
                <input className="input mt-2" {...register("ca")} />
              </label>
              <label className="text-sm font-semibold md:col-span-2">
                Observação
                <textarea
                  className="input mt-2 min-h-24"
                  {...register("note")}
                />
              </label>
              {create.isError && (
                <p className="md:col-span-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {(create.error as { detail?: { message?: string } }).detail
                    ?.message || "Não foi possível cadastrar o produto."}
                </p>
              )}
            </fieldset>
            <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-7 py-4">
              <button
                type="button"
                className="rounded-lg border px-4 py-2"
                onClick={closeForm}
              >
                {canManage ? "Cancelar" : "Fechar"}
              </button>
              {canManage && (
                <button className="button" disabled={create.isPending}>
                  <Save size={17} />
                  {create.isPending
                    ? "Salvando…"
                    : editing
                      ? "Salvar alterações"
                      : "Salvar item"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function NewRequest() {
  const nav = useNavigate();
  const { user } = useAuth();
  const form = useForm<
    z.input<typeof purchaseRequestSchema>,
    unknown,
    PurchaseRequestInput
  >({
    resolver: zodResolver(purchaseRequestSchema),
    defaultValues: {
      requestDate: new Date(),
      requesterOriginal: "",
      items: [
        { description: "", quantity: 1, unit: "UN", criticality: "MEDIA" },
      ],
    },
  });
  const fields = useFieldArray({ control: form.control, name: "items" });
  const watchedItems = form.watch("items") || [];
  const products = useQuery({
    queryKey: ["products", "request-picker"],
    queryFn: () =>
      api<{ data: Product[] }>(
        `/products?limit=200&sortBy=genericDescription&sortDir=asc`,
      ),
  });
  const mutation = useMutation({
    mutationFn: (v: PurchaseRequestInput) =>
      api("/requests", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      nav("/solicitacoes");
    },
  });
  const filledItems = watchedItems.filter((item) =>
    item?.description?.trim(),
  ).length;
  return (
    <form
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
      className="-m-4 sm:-m-7"
    >
      <div className="border-b bg-white px-4 py-6 sm:px-7">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-blue-700">
              <ClipboardList size={15} /> Solicitações de compra
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Nova solicitação
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Informe os dados gerais e adicione todos os produtos necessários.
            </p>
          </div>
          {user.role === "COMPRAS" && (
            <Link
              to="/produtos?novo=1"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
            >
              <Plus size={18} /> Cadastrar produto
            </Link>
          )}
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-7 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-700 text-sm font-bold text-white">
                1
              </span>
              <div>
                <h2 className="font-bold text-slate-900">
                  Dados da solicitação
                </h2>
                <p className="text-xs text-slate-500">
                  Informações gerais do pedido
                </p>
              </div>
            </div>
            <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
              <label className="text-sm font-semibold text-slate-700">
                Data da solicitação <span className="text-red-500">*</span>
                <input
                  type="date"
                  className="input mt-2 h-12"
                  {...form.register("requestDate", { valueAsDate: true })}
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Nome do solicitante <span className="text-red-500">*</span>
                <input
                  className="input mt-2 h-12"
                  maxLength={120}
                  placeholder="Informe o nome completo"
                  {...form.register("requesterOriginal")}
                />
                {form.formState.errors.requesterOriginal && (
                  <span className="mt-1 block text-xs text-red-600">
                    {form.formState.errors.requesterOriginal.message}
                  </span>
                )}
              </label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Observações gerais{" "}
                <span className="font-normal text-slate-400">(opcional)</span>
                <textarea
                  className="input mt-2 min-h-24 py-3"
                  placeholder="Contexto, prazo desejado ou informações importantes…"
                  {...form.register("notes")}
                />
              </label>
              <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 sm:col-span-2">
                <UserRound size={20} className="shrink-0 text-blue-700" />
                <div>
                  <p className="text-xs font-medium text-blue-600">
                    Usuário responsável pelo registro
                  </p>
                  <p className="font-bold">{user.name}</p>
                  <p className="text-xs text-blue-700/80">
                    Esta informação é registrada automaticamente para
                    rastreabilidade.
                  </p>
                </div>
              </div>
            </div>
          </section>
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-700 text-sm font-bold text-white">
                  2
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">
                    Itens da solicitação
                  </h2>
                  <p className="text-xs text-slate-500">
                    Adicione um ou mais produtos
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700"
                onClick={() =>
                  fields.append({
                    description: "",
                    quantity: 1,
                    unit: "UN",
                    criticality: "MEDIA",
                  })
                }
              >
                <Plus size={17} /> Adicionar outro item
              </button>
            </div>
            <div className="space-y-4">
              {fields.fields.map((field, index) => (
                <article
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition focus-within:border-blue-300 focus-within:shadow-md"
                  key={field.id}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          Item {index + 1}
                        </p>
                        <p className="max-w-[52vw] truncate text-xs text-slate-500">
                          {watchedItems[index]?.description ||
                            "Selecione um produto do catálogo"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={fields.fields.length === 1}
                      className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                      onClick={() => fields.remove(index)}
                    >
                      Remover
                    </button>
                  </div>
                  <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-12">
                    <label className="min-w-0 text-sm font-semibold text-slate-700 md:col-span-12">
                      Produto do catálogo{" "}
                      <span className="text-red-500">*</span>
                      <select
                        className="input mt-2 h-12 min-w-0 bg-slate-50"
                        {...form.register(`items.${index}.productId`)}
                        onChange={(e) => {
                          const p = products.data?.data.find(
                            (x) => x.id === e.target.value,
                          );
                          form.setValue(
                            `items.${index}.productId`,
                            e.target.value || undefined,
                          );
                          if (p) {
                            form.setValue(
                              `items.${index}.description`,
                              p.genericDescription,
                              { shouldValidate: true },
                            );
                            form.setValue(
                              `items.${index}.unit`,
                              p.unit || "UN",
                            );
                            form.setValue(`items.${index}.manualCode`, p.code);
                          }
                        }}
                      >
                        <option value="">
                          {products.isLoading
                            ? "Carregando produtos…"
                            : "Selecione um produto ou preencha manualmente"}
                        </option>
                        {products.data?.data.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} — {p.genericDescription}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="min-w-0 text-sm font-semibold text-slate-700 md:col-span-8">
                      Descrição <span className="text-red-500">*</span>
                      <input
                        className="input mt-2 h-12"
                        placeholder="Descrição completa do item"
                        {...form.register(`items.${index}.description`)}
                      />
                      {form.formState.errors.items?.[index]?.description && (
                        <span className="mt-1 block text-xs text-red-600">
                          Informe a descrição do item.
                        </span>
                      )}
                    </label>
                    <label className="text-sm font-semibold text-slate-700 md:col-span-4">
                      Código
                      <input
                        className="input mt-2 h-12 bg-slate-50 font-mono"
                        placeholder="Automático"
                        {...form.register(`items.${index}.manualCode`)}
                      />
                    </label>
                    <label className="text-sm font-semibold text-slate-700 md:col-span-4">
                      Quantidade <span className="text-red-500">*</span>
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        className="input mt-2 h-12"
                        {...form.register(`items.${index}.quantity`)}
                      />
                    </label>
                    <label className="text-sm font-semibold text-slate-700 md:col-span-3">
                      Unidade <span className="text-red-500">*</span>
                      <input
                        className="input mt-2 h-12 uppercase"
                        placeholder="UN"
                        {...form.register(`items.${index}.unit`)}
                      />
                    </label>
                    <label className="text-sm font-semibold text-slate-700 md:col-span-5">
                      Criticidade
                      <select
                        className="input mt-2 h-12"
                        {...form.register(`items.${index}.criticality`)}
                      >
                        <option value="BAIXA">Baixa — pode aguardar</option>
                        <option value="MEDIA">Média — prazo normal</option>
                        <option value="ALTA">
                          Alta — atendimento prioritário
                        </option>
                      </select>
                    </label>
                  </div>
                </article>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 text-sm font-semibold text-slate-600 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
              onClick={() =>
                fields.append({
                  description: "",
                  quantity: 1,
                  unit: "UN",
                  criticality: "MEDIA",
                })
              }
            >
              <Plus size={18} /> Adicionar mais um item
            </button>
          </section>
        </div>
        <aside className="xl:relative">
          <div className="space-y-4 xl:sticky xl:top-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-900">Resumo</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-slate-500">Itens adicionados</span>
                  <strong className="text-lg text-slate-900">
                    {fields.fields.length}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Itens preenchidos</span>
                  <strong
                    className={
                      filledItems === fields.fields.length
                        ? "text-green-700"
                        : "text-amber-600"
                    }
                  >
                    {filledItems} de {fields.fields.length}
                  </strong>
                </div>
              </div>
              <div className="mt-5 rounded-xl bg-blue-50 p-4 text-xs leading-5 text-blue-800">
                Revise as quantidades e a criticidade antes de enviar. A
                solicitação ficará disponível imediatamente para acompanhamento.
              </div>
            </section>
            {mutation.isError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Não foi possível salvar. Revise os campos obrigatórios e tente
                novamente.
              </div>
            )}
            <button
              className="button h-12 w-full rounded-xl text-base shadow-lg shadow-blue-700/20"
              disabled={mutation.isPending}
            >
              <Save size={18} />
              {mutation.isPending
                ? "Salvando solicitação…"
                : "Criar solicitação"}
            </button>
            <button
              type="button"
              onClick={() => nav("/solicitacoes")}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </aside>
      </div>
    </form>
  );
}

function Reports() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(`/api/reports/consolidated?year=${year}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Falha ao gerar relatório");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const fileName = match?.[1] || `SOLICITACAO_DE_COMPRA_ERM_${year}.xlsx`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[.16em] text-blue-700">
          Exportação oficial
        </p>
        <h1 className="mt-1 text-2xl font-bold">Relatórios Excel</h1>
        <p className="text-slate-500">
          Gere uma cópia fiel do modelo ERM atualizada com os dados do sistema.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="card">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-green-50 p-3 text-green-700">
              <FileSpreadsheet size={28} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Solicitação de Compra ERM</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Mantém as abas, formatação, filtros, fórmulas e configurações do
                arquivo original. Atualiza o catálogo de produtos, saldos de
                estoque e as solicitações do ano selecionado.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              "15 abas do modelo preservadas",
              "Produtos e estoque atualizados",
              "Solicitações e itens atualizados",
              "Pedidos, fornecedores e entregas",
            ].map((text) => (
              <div
                className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm font-medium text-slate-700"
                key={text}
              >
                <CheckCircle2 size={17} className="text-green-600" />
                {text}
              </div>
            ))}
          </div>
        </section>
        <aside className="card">
          <label className="block text-sm font-semibold">
            Ano das solicitações
            <select
              className="input mt-2 h-11"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {Array.from({ length: 5 }, (_, index) => currentYear - index).map(
                (option) => (
                  <option key={option}>{option}</option>
                ),
              )}
            </select>
          </label>
          <button
            type="button"
            className="button mt-5 h-12 w-full"
            onClick={download}
            disabled={downloading}
          >
            <FileSpreadsheet size={18} />
            {downloading ? "Gerando planilha…" : "Gerar e baixar Excel"}
          </button>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            O arquivo é gerado no momento do clique com os dados mais recentes.
          </p>
        </aside>
      </div>
    </>
  );
}
function NewRequestAccess({ role }: { role: string }) {
  const [view, setView] = useState<"request" | "planning">("request");
  if (role === "COMPRAS") return <Purchases role={role} mode="planning" />;
  if (role !== "ADMIN") return <NewRequest />;
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === "request" ? "bg-blue-700 text-white" : "text-slate-600"}`}
          onClick={() => setView("request")}
        >
          Criar pedido interno
        </button>
        <button
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === "planning" ? "bg-blue-700 text-white" : "text-slate-600"}`}
          onClick={() => setView("planning")}
        >
          Gerar ordem de compra
        </button>
      </div>
      {view === "request" ? (
        <NewRequest />
      ) : (
        <Purchases role={role} mode="planning" />
      )}
    </div>
  );
}
function ProtectedApp() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: CurrentUser }>("/auth/me"),
    retry: false,
  });
  const nav = useNavigate();
  if (isLoading)
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
          <p className="text-sm text-slate-400">Verificando acesso…</p>
        </div>
      </div>
    );
  if (isError || !data) return <Navigate to="/login" replace />;
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    queryClient.clear();
    nav("/login", { replace: true });
  };
  return (
    <AuthContext.Provider value={{ user: data.user, logout }}>
      {data.user.mustChangePassword && <ChangePassword />}
      <Shell>
        <Suspense
          fallback={
            <div className="grid min-h-64 place-items-center rounded-2xl border border-slate-200 bg-white">
              <div className="text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                <p className="text-sm text-slate-500">Carregando módulo…</p>
              </div>
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/estoque" element={<Stock role={data.user.role} />} />
            <Route
              path="/produtos"
              element={<Products role={data.user.role} />}
            />
            <Route path="/solicitacoes" element={<Requests />} />
            <Route
              path="/nova"
              element={<NewRequestAccess role={data.user.role} />}
            />
            <Route
              path="/compras"
              element={<Purchases role={data.user.role} />}
            />
            <Route
              path="/fornecedores"
              element={
                ["ADMIN", "COMPRAS"].includes(data.user.role) ? (
                  <Suppliers role={data.user.role} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/retiradas"
              element={
                data.user.role !== "CONSULTA" ? (
                  <MaterialWithdrawals role={data.user.role} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/solicitar-cadastro"
              element={
                ["ADMIN", "ALMOXARIFADO"].includes(data.user.role) ? (
                  <ProductRegistrationRequests />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="/relatorios" element={<Reports />} />
            <Route
              path="/usuarios"
              element={
                data.user.role === "ADMIN" ? (
                  <Users />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="/auditoria" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
      </Shell>
    </AuthContext.Provider>
  );
}
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<ProtectedApp />} />
      </Routes>
    </BrowserRouter>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
