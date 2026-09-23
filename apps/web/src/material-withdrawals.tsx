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
  Printer,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useDebouncedValue } from "./use-debounced-value";

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
type PageResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
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

function WithdrawalsPagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 text-sm">
      <span className="text-slate-500">
        Página {page} de {pages} · {total} retirada(s)
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-2 font-semibold disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

export function MaterialWithdrawals({ role }: { role: string }) {
  const cache = useQueryClient();
  const warehouse = ["ADMIN", "ALMOXARIFADO"].includes(role);
  const [tab, setTab] = useState<"request" | "queue" | "history" | "print">(
    "request",
  );
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
  const [printId, setPrintId] = useState("");
  const [printPrompt, setPrintPrompt] = useState<Withdrawal | null>(null);
  const [printWhenReady, setPrintWhenReady] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const debouncedHistorySearch = useDebouncedValue(historySearch);
  const pageSize = 20;

  const catalog = useQuery({
    queryKey: ["withdrawal-catalog", debouncedSearch],
    queryFn: () =>
      withdrawalApi<CatalogProduct[]>(
        `/catalog?q=${encodeURIComponent(debouncedSearch)}`,
      ),
    enabled: tab === "request",
  });
  const withdrawals = useQuery({
    queryKey: ["material-withdrawals", tab, debouncedHistorySearch, page],
    queryFn: () =>
      withdrawalApi<PageResult<Withdrawal>>(
        `?q=${encodeURIComponent(debouncedHistorySearch)}&page=${page}&pageSize=${pageSize}${tab === "queue" ? "&status=PENDENTE" : ""}`,
      ),
    enabled: tab !== "request",
    refetchInterval: tab === "queue" ? 20_000 : 60_000,
    placeholderData: (previous) => previous,
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
      setPrintId(created.id);
      setPrintPrompt(created);
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
      ? withdrawals.data?.total || 0
      : withdrawals.data?.data.filter((item) => item.status === "PENDENTE")
          .length || 0;
  const printableWithdrawal =
    withdrawals.data?.data.find((item) => item.id === printId) ||
    withdrawals.data?.data[0];
  useEffect(() => {
    if (
      !printWhenReady ||
      tab !== "print" ||
      printableWithdrawal?.id !== printWhenReady
    )
      return;
    const timer = window.setTimeout(() => {
      setPrintWhenReady("");
      window.print();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [printWhenReady, printableWithdrawal?.id, tab]);

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
        className={`grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm ${warehouse ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}
      >
        <TabButton
          active={tab === "request"}
          icon={<Plus size={19} />}
          title="Nova retirada"
          detail="Consultar e reservar"
          onClick={() => {
            setPage(1);
            setTab("request");
          }}
        />
        {warehouse && (
          <TabButton
            active={tab === "queue"}
            icon={<ClipboardCheck size={19} />}
            title="Baixas pendentes"
            detail="Confirmar entrega"
            onClick={() => {
              setPage(1);
              setTab("queue");
            }}
          />
        )}
        <TabButton
          active={tab === "history"}
          icon={<Clock3 size={19} />}
          title={warehouse ? "Histórico" : "Minhas retiradas"}
          detail="Reservas e movimentações"
          onClick={() => {
            setPage(1);
            setTab("history");
          }}
        />
        <TabButton
          active={tab === "print"}
          icon={<Printer size={19} />}
          title="Impressão"
          detail="Termo com assinatura"
          onClick={() => {
            setPage(1);
            setTab("print");
          }}
        />
      </nav>

      {message && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          <CheckCircle2 size={18} /> {message}
        </p>
      )}

      {printPrompt && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <section className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="bg-blue-950 px-6 py-5 text-white">
              <Printer size={24} className="text-blue-300" />
              <h2 className="mt-3 text-xl font-bold">Imprimir a retirada?</h2>
              <p className="mt-1 text-sm text-blue-100">
                A retirada {printPrompt.number} foi criada e os materiais já
                estão reservados.
              </p>
            </div>
            <div className="p-6">
              <p className="text-sm leading-6 text-slate-600">
                Deseja abrir agora o termo com os materiais e os campos de
                assinatura?
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={() => setPrintPrompt(null)}
                >
                  Agora não
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setPrintWhenReady(printPrompt.id);
                    setPrintId(printPrompt.id);
                    setPrintPrompt(null);
                    setTab("print");
                  }}
                >
                  <Printer size={17} /> Imprimir agora
                </button>
              </div>
            </div>
          </section>
        </div>
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
      ) : tab === "print" ? (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="no-print h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-6">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">
              Documento de retirada
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">
              Selecionar para impressão
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Escolha uma retirada para gerar o termo com os dados do sistema e
              o campo de assinatura do colaborador.
            </p>
            {withdrawals.isLoading ? (
              <p className="mt-5 text-sm text-slate-500">
                Carregando retiradas...
              </p>
            ) : withdrawals.data?.data.length ? (
              <>
                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  Retirada
                  <select
                    className="input mt-2"
                    value={printableWithdrawal?.id || ""}
                    onChange={(event) => setPrintId(event.target.value)}
                  >
                    {withdrawals.data.data.map((withdrawal) => (
                      <option key={withdrawal.id} value={withdrawal.id}>
                        {withdrawal.number} — {withdrawal.requestedBy.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button mt-5 h-11 w-full"
                  onClick={() => window.print()}
                >
                  <Printer size={18} /> Imprimir termo
                </button>
              </>
            ) : (
              <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Nenhuma retirada disponível para impressão.
              </p>
            )}
          </aside>

          {printableWithdrawal && (
            <article
              id="withdrawal-print"
              className="withdrawal-print-sheet overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <header className="flex items-center justify-between gap-4 border-b-2 border-blue-900 px-5 py-3">
                <img
                  src="/erm-logo.png"
                  alt="Estaleiro Rio Maguari"
                  className="h-10 w-auto object-contain"
                />
                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase tracking-[.14em] text-blue-700">
                    Controle de Almoxarifado
                  </p>
                  <h2 className="mt-0.5 text-lg font-bold text-slate-950">
                    Termo de Retirada de Material
                  </h2>
                  <p className="mt-0.5 font-mono text-xs font-bold text-blue-800">
                    {printableWithdrawal.number}
                  </p>
                </div>
              </header>

              <div className="space-y-4 p-5">
                <section className="grid gap-x-5 gap-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  <PrintField
                    label="Solicitado por"
                    value={printableWithdrawal.requestedBy.name}
                  />
                  <PrintField
                    label="Data da solicitação"
                    value={new Date(
                      printableWithdrawal.requestedAt,
                    ).toLocaleString("pt-BR")}
                  />
                  <PrintField
                    label="Prazo da reserva"
                    value={new Date(
                      printableWithdrawal.expiresAt,
                    ).toLocaleString("pt-BR")}
                  />
                  <PrintField
                    label="Setor / destino"
                    value={printableWithdrawal.destination}
                  />
                  <PrintField
                    label="Obra"
                    value={printableWithdrawal.workSite}
                  />
                  <PrintField
                    label="Status"
                    value={statusInfo[printableWithdrawal.status].label}
                  />
                  <div className="sm:col-span-2 lg:col-span-3">
                    <PrintField
                      label="Finalidade"
                      value={printableWithdrawal.purpose}
                    />
                  </div>
                  {printableWithdrawal.processedAt && (
                    <>
                      <PrintField
                        label="Baixa realizada em"
                        value={new Date(
                          printableWithdrawal.processedAt,
                        ).toLocaleString("pt-BR")}
                      />
                      <PrintField
                        label="Baixa realizada por"
                        value={
                          printableWithdrawal.processedBy?.name ||
                          "Não informado"
                        }
                      />
                    </>
                  )}
                  {printableWithdrawal.cancelReason && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <PrintField
                        label="Motivo do cancelamento"
                        value={printableWithdrawal.cancelReason}
                      />
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                    Materiais
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-slate-300">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 text-left text-[10px] uppercase text-slate-600">
                        <tr>
                          <th className="px-3 py-2">Código</th>
                          <th className="px-3 py-2">Descrição</th>
                          <th className="px-3 py-2 text-right">Quantidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {printableWithdrawal.items.map((item) => (
                          <tr
                            key={item.id}
                            className="border-t border-slate-200"
                          >
                            <td className="px-3 py-2 font-mono text-[10px] font-bold">
                              {item.product.code}
                            </td>
                            <td className="px-3 py-2">
                              {item.product.genericDescription}
                            </td>
                            <td className="px-3 py-2 text-right font-bold">
                              {formatNumber(item.quantity)}{" "}
                              {item.product.unit || "UN"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="grid gap-10 pt-8 sm:grid-cols-2">
                  <SignatureField label="Assinatura do colaborador" />
                  <SignatureField label="Responsável do Almoxarifado" />
                </section>
              </div>
            </article>
          )}
        </div>
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
                onChange={(event) => {
                  setHistorySearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Buscar número, obra, finalidade ou material"
              />
            </label>
          </div>
          {withdrawals.isLoading ? (
            <p className="p-10 text-center text-sm text-slate-500">
              Carregando retiradas...
            </p>
          ) : withdrawals.data?.data.length ? (
            <div className="bg-slate-50/50">
              <div className="space-y-4 p-4 sm:p-6">
                {withdrawals.data.data.map((withdrawal) => {
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
              <WithdrawalsPagination
                page={withdrawals.data.page}
                pageSize={withdrawals.data.pageSize}
                total={withdrawals.data.total}
                onChange={setPage}
              />
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

function PrintField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function SignatureField({ label }: { label: string }) {
  return (
    <div className="pt-7 text-center">
      <div className="border-t border-slate-700" />
      <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
        {label}
      </p>
      <p className="mt-0.5 text-[9px] text-slate-400">
        Nome, data e assinatura
      </p>
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
