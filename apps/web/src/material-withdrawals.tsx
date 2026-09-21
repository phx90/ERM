import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  PackageMinus,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

type CatalogProduct = {
  id: string;
  code: string;
  genericDescription: string;
  unit?: string;
  stockBalance: string;
  reservedQuantity: string;
  availableQuantity: string;
};

type Withdrawal = {
  id: string;
  number: string;
  purpose: string;
  destination: string;
  workSite: string;
  requestedAt: string;
  expiresAt: string;
  status: "PENDENTE" | "RETIRADA" | "CANCELADA" | "EXPIRADA";
  processedAt?: string;
  cancelReason?: string;
  requestedBy: { name: string };
  processedBy?: { name: string };
  items: Array<{
    id: string;
    quantity: string;
    product: {
      code: string;
      genericDescription: string;
      unit?: string;
    };
  }>;
};

const formatNumber = (value: string | number) =>
  Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const defaultExpiry = () => {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

async function withdrawalApi<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/material-withdrawals${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(" ")
      : data?.message;
    throw new Error(
      typeof message === "string"
        ? message
        : "Não foi possível concluir a operação.",
    );
  }
  return data;
}

const statusInfo = {
  PENDENTE: {
    label: "Reservada",
    style: "bg-amber-50 text-amber-700",
  },
  RETIRADA: {
    label: "Retirada concluída",
    style: "bg-emerald-50 text-emerald-700",
  },
  CANCELADA: { label: "Cancelada", style: "bg-slate-100 text-slate-600" },
  EXPIRADA: { label: "Reserva expirada", style: "bg-red-50 text-red-700" },
};

export function MaterialWithdrawals({ role }: { role: string }) {
  const cache = useQueryClient();
  const warehouse = ["ADMIN", "ALMOXARIFADO"].includes(role);
  const [tab, setTab] = useState<"request" | "queue" | "history">("request");
  const [search, setSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [purpose, setPurpose] = useState("");
  const [destination, setDestination] = useState("");
  const [workSite, setWorkSite] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [canceling, setCanceling] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [message, setMessage] = useState("");

  const catalog = useQuery({
    queryKey: ["withdrawal-catalog", search],
    queryFn: () =>
      withdrawalApi<CatalogProduct[]>(
        `/catalog?q=${encodeURIComponent(search)}`,
      ),
    enabled: tab === "request",
  });
  const withdrawals = useQuery({
    queryKey: ["material-withdrawals", tab, historySearch],
    queryFn: () =>
      withdrawalApi<Withdrawal[]>(
        `?q=${encodeURIComponent(historySearch)}${tab === "queue" ? "&status=PENDENTE" : ""}`,
      ),
    enabled: tab !== "request",
    refetchInterval: tab === "queue" ? 20_000 : 60_000,
  });
  const selectedItems = useMemo(
    () =>
      Object.entries(quantities)
        .filter(([, quantity]) => Number(quantity) > 0)
        .map(([productId, quantity]) => ({ productId, quantity })),
    [quantities],
  );
  const selectedProducts = (catalog.data || []).filter(
    (product) => Number(quantities[product.id]) > 0,
  );

  const refresh = async () => {
    await Promise.all(
      [
        ["withdrawal-catalog"],
        ["material-withdrawals"],
        ["stock"],
        ["stock-history"],
      ].map((queryKey) => cache.invalidateQueries({ queryKey })),
    );
  };
  const createWithdrawal = useMutation({
    mutationFn: () =>
      withdrawalApi<Withdrawal>("", {
        method: "POST",
        body: JSON.stringify({
          purpose,
          destination,
          workSite,
          expiresAt,
          items: selectedItems,
        }),
      }),
    onSuccess: async (created) => {
      setPurpose("");
      setDestination("");
      setWorkSite("");
      setExpiresAt(defaultExpiry());
      setQuantities({});
      setMessage(
        `${created.number} criada. Os materiais estão reservados até o prazo informado.`,
      );
      await refresh();
      setTab(warehouse ? "queue" : "history");
    },
  });
  const completeWithdrawal = useMutation({
    mutationFn: (id: string) =>
      withdrawalApi<Withdrawal>(`/${id}/complete`, { method: "POST" }),
    onSuccess: async (completed) => {
      setMessage(
        `Baixa da ${completed.number} concluída e estoque atualizado.`,
      );
      await refresh();
    },
  });
  const cancelWithdrawal = useMutation({
    mutationFn: (id: string) =>
      withdrawalApi<Withdrawal>(`/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason }),
      }),
    onSuccess: async (canceled) => {
      setCanceling(null);
      setCancelReason("");
      setMessage(
        `${canceled.number} cancelada. A reserva voltou ao saldo disponível.`,
      );
      await refresh();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selectedItems.length) createWithdrawal.mutate();
  };
  const pendingCount =
    tab === "queue"
      ? withdrawals.data?.length || 0
      : withdrawals.data?.filter((item) => item.status === "PENDENTE").length ||
        0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-600/25 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-blue-300">
              <PackageMinus size={16} /> Controle de materiais
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Retirada de Material
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Reserve materiais disponíveis e acompanhe a entrega e a baixa pelo
              almoxarifado.
            </p>
          </div>
          <div className="grid min-w-64 grid-cols-2 gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-blue-300">
                Selecionados
              </p>
              <p className="mt-1 text-2xl font-bold">{selectedItems.length}</p>
              <p className="text-xs text-slate-400">materiais</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-blue-300">
                Pendentes
              </p>
              <p className="mt-1 text-2xl font-bold">
                {tab === "request" ? "—" : pendingCount}
              </p>
              <p className="text-xs text-slate-400">reservas</p>
            </div>
          </div>
        </div>
      </section>

      <nav
        className={`grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm ${warehouse ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      >
        <TabButton
          active={tab === "request"}
          icon={<Plus size={19} />}
          title="Nova retirada"
          detail="Consultar e reservar"
          onClick={() => setTab("request")}
        />
        {warehouse && (
          <TabButton
            active={tab === "queue"}
            icon={<ClipboardCheck size={19} />}
            title="Baixas pendentes"
            detail="Confirmar entrega"
            onClick={() => setTab("queue")}
          />
        )}
        <TabButton
          active={tab === "history"}
          icon={<Clock3 size={19} />}
          title={warehouse ? "Histórico" : "Minhas retiradas"}
          detail="Reservas e movimentações"
          onClick={() => setTab("history")}
        />
      </nav>

      {message && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          <CheckCircle2 size={18} /> {message}
        </p>
      )}

      {tab === "request" ? (
        <form
          onSubmit={submit}
          className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.55fr)]"
        >
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b bg-slate-50/70 p-5">
              <h2 className="font-bold text-slate-950">
                Materiais disponíveis
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                O saldo disponível já desconta todas as reservas ativas.
              </p>
              <label className="relative mt-4 block">
                <Search
                  className="absolute left-3.5 top-3 text-slate-400"
                  size={18}
                />
                <input
                  className="input h-11 pl-11"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por código ou descrição"
                />
              </label>
            </div>
            {catalog.isLoading ? (
              <p className="p-10 text-center text-sm text-slate-500">
                Consultando estoque...
              </p>
            ) : catalog.data?.length ? (
              <div className="divide-y divide-slate-100">
                {catalog.data.map((product) => {
                  const available = Number(product.availableQuantity);
                  const selected = Number(quantities[product.id] || 0);
                  return (
                    <article
                      className={`grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_230px] md:items-center ${selected > 0 ? "bg-blue-50/50" : ""}`}
                      key={product.id}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-700">
                            {product.code}
                          </span>
                          {Number(product.reservedQuantity) > 0 && (
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                              {formatNumber(product.reservedQuantity)} reservado
                            </span>
                          )}
                        </div>
                        <p className="mt-2 font-semibold text-slate-900">
                          {product.genericDescription}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                          <span>
                            Físico:{" "}
                            <strong className="text-slate-700">
                              {formatNumber(product.stockBalance)}
                            </strong>
                          </span>
                          <span>
                            Disponível:{" "}
                            <strong
                              className={
                                available > 0
                                  ? "text-emerald-700"
                                  : "text-red-600"
                              }
                            >
                              {formatNumber(product.availableQuantity)}{" "}
                              {product.unit || "UN"}
                            </strong>
                          </span>
                        </div>
                      </div>
                      <label className="text-xs font-bold text-slate-600">
                        Quantidade para reservar
                        <div className="mt-1.5 flex gap-2">
                          <input
                            type="number"
                            min="0"
                            max={product.availableQuantity}
                            step="0.001"
                            className="input h-10"
                            value={quantities[product.id] || ""}
                            disabled={available <= 0}
                            placeholder={available > 0 ? "0" : "Indisponível"}
                            onChange={(event) =>
                              setQuantities((current) => ({
                                ...current,
                                [product.id]: event.target.value,
                              }))
                            }
                          />
                          {selected > 0 && (
                            <button
                              type="button"
                              aria-label="Remover material"
                              className="rounded-lg border border-red-200 px-3 text-red-600 hover:bg-red-50"
                              onClick={() =>
                                setQuantities((current) => ({
                                  ...current,
                                  [product.id]: "",
                                }))
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </label>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center">
                <Boxes className="mx-auto text-slate-300" size={34} />
                <p className="mt-3 font-semibold text-slate-700">
                  Nenhum material encontrado
                </p>
              </div>
            )}
          </section>

          <aside className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-6">
            <div className="border-b border-slate-100 p-5">
              <h2 className="font-bold text-slate-950">Dados da retirada</h2>
              <p className="mt-1 text-xs text-slate-500">
                A reserva será liberada automaticamente se o prazo vencer.
              </p>
            </div>
            <div className="space-y-5 p-5">
              <label className="block text-sm font-semibold text-slate-700">
                Finalidade <span className="text-red-500">*</span>
                <textarea
                  className="input mt-2 min-h-24"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="Informe onde ou como o material será utilizado"
                  maxLength={500}
                  required
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Setor / destino <span className="text-red-500">*</span>
                <input
                  className="input mt-2"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  placeholder="Ex.: Manutenção"
                  maxLength={160}
                  required
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Obra <span className="text-red-500">*</span>
                <input
                  className="input mt-2"
                  value={workSite}
                  onChange={(event) => setWorkSite(event.target.value)}
                  placeholder="Informe a obra vinculada"
                  maxLength={160}
                  required
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Retirar até <span className="text-red-500">*</span>
                <input
                  type="datetime-local"
                  className="input mt-2"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  required
                />
              </label>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Resumo
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {selectedProducts.length} material(is) selecionado(s)
                </p>
                {selectedProducts.slice(0, 4).map((product) => (
                  <p
                    className="mt-1 truncate text-xs text-slate-500"
                    key={product.id}
                  >
                    {formatNumber(quantities[product.id])}{" "}
                    {product.unit || "UN"} · {product.genericDescription}
                  </p>
                ))}
              </div>
              {createWithdrawal.isError && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {createWithdrawal.error.message}
                </p>
              )}
              <button
                className="button h-12 w-full rounded-xl"
                disabled={
                  !selectedItems.length ||
                  !purpose.trim() ||
                  !destination.trim() ||
                  !workSite.trim() ||
                  !expiresAt ||
                  createWithdrawal.isPending
                }
              >
                <PackageMinus size={18} />
                {createWithdrawal.isPending
                  ? "Reservando..."
                  : "Solicitar e reservar materiais"}
              </button>
            </div>
          </aside>
        </form>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b bg-slate-50/70 p-5">
            <div>
              <h2 className="font-bold text-slate-950">
                {tab === "queue"
                  ? "Reservas aguardando baixa"
                  : "Histórico de retiradas"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {tab === "queue"
                  ? "Confirme a entrega para efetivar a saída no estoque."
                  : "Consulte solicitações, reservas expiradas e retiradas concluídas."}
              </p>
            </div>
            <label className="relative w-full sm:w-80">
              <Search
                className="absolute left-3.5 top-3 text-slate-400"
                size={18}
              />
              <input
                className="input h-11 pl-11"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Buscar número, obra, finalidade ou material"
              />
            </label>
          </div>
          {withdrawals.isLoading ? (
            <p className="p-10 text-center text-sm text-slate-500">
              Carregando retiradas...
            </p>
          ) : withdrawals.data?.length ? (
            <div className="space-y-4 bg-slate-50/50 p-4 sm:p-6">
              {withdrawals.data.map((withdrawal) => {
                const info = statusInfo[withdrawal.status];
                return (
                  <article
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                    key={withdrawal.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-blue-700">
                            {withdrawal.number}
                          </h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${info.style}`}
                          >
                            {info.label}
                          </span>
                        </div>
                        <p className="mt-2 font-semibold text-slate-900">
                          {withdrawal.purpose}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {withdrawal.requestedBy.name} ·{" "}
                          {withdrawal.destination}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-blue-700">
                          Obra: {withdrawal.workSite}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <p className="flex items-center gap-1.5">
                          <CalendarClock size={14} />
                          Reserva até{" "}
                          {new Date(withdrawal.expiresAt).toLocaleString(
                            "pt-BR",
                          )}
                        </p>
                        <p className="mt-1">
                          Solicitada em{" "}
                          {new Date(withdrawal.requestedAt).toLocaleString(
                            "pt-BR",
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100 px-5">
                      {withdrawal.items.map((item) => (
                        <div
                          className="grid gap-2 py-3 sm:grid-cols-[120px_minmax(0,1fr)_140px] sm:items-center"
                          key={item.id}
                        >
                          <span className="font-mono text-xs font-bold text-slate-500">
                            {item.product.code}
                          </span>
                          <span className="text-sm font-medium text-slate-800">
                            {item.product.genericDescription}
                          </span>
                          <strong className="text-sm text-blue-700 sm:text-right">
                            {formatNumber(item.quantity)}{" "}
                            {item.product.unit || "UN"}
                          </strong>
                        </div>
                      ))}
                    </div>
                    {withdrawal.cancelReason && (
                      <p className="mx-5 mb-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                        Motivo do cancelamento: {withdrawal.cancelReason}
                      </p>
                    )}
                    {withdrawal.status === "PENDENTE" && (
                      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                        {canceling === withdrawal.id ? (
                          <>
                            <input
                              className="input h-10 min-w-64 flex-1"
                              value={cancelReason}
                              onChange={(event) =>
                                setCancelReason(event.target.value)
                              }
                              placeholder="Motivo do cancelamento"
                              minLength={3}
                              maxLength={500}
                            />
                            <button
                              type="button"
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              onClick={() => {
                                setCanceling(null);
                                setCancelReason("");
                              }}
                            >
                              Voltar
                            </button>
                            <button
                              type="button"
                              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                              disabled={
                                cancelReason.trim().length < 3 ||
                                cancelWithdrawal.isPending
                              }
                              onClick={() =>
                                cancelWithdrawal.mutate(withdrawal.id)
                              }
                            >
                              Confirmar cancelamento
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                              onClick={() => setCanceling(withdrawal.id)}
                            >
                              <Ban size={16} /> Cancelar e liberar reserva
                            </button>
                            {warehouse && (
                              <button
                                type="button"
                                className="button"
                                disabled={completeWithdrawal.isPending}
                                onClick={() =>
                                  completeWithdrawal.mutate(withdrawal.id)
                                }
                              >
                                <ClipboardCheck size={17} />
                                Dar baixa na retirada
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center">
              {tab === "queue" ? (
                <CheckCircle2 className="mx-auto text-emerald-400" size={36} />
              ) : (
                <AlertTriangle className="mx-auto text-slate-300" size={36} />
              )}
              <p className="mt-3 font-semibold text-slate-700">
                {tab === "queue"
                  ? "Nenhuma retirada aguardando baixa"
                  : "Nenhuma retirada encontrada"}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TabButton({
  active,
  icon,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl p-3 text-left transition ${active ? "bg-blue-700 text-white" : "hover:bg-slate-50"}`}
    >
      <span
        className={`grid h-10 w-10 place-items-center rounded-lg ${active ? "bg-white/15" : "bg-blue-50 text-blue-700"}`}
      >
        {icon}
      </span>
      <span>
        <strong className="block text-sm">{title}</strong>
        <small className={active ? "text-blue-100" : "text-slate-400"}>
          {detail}
        </small>
      </span>
    </button>
  );
}
