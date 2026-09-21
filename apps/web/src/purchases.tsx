import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  PackageOpen,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";

type DemandItem = {
  id: string;
  description: string;
  manualCode?: string;
  unit: string;
  requestedQuantity: string;
  purchasedQuantity: string;
  openQuantity: string;
  product?: { id: string; code: string };
  request: { id: string; number: string; requestDate: string };
  status: { label: string };
};
type OrderItem = {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  receivedQuantity: string;
  openQuantity: string;
  product?: { code: string };
  allocations?: Array<{ requestItem: { request: { number: string } } }>;
};
type Order = {
  id: string;
  number: string;
  status: string;
  acquiredAt?: string;
  expectedAt?: string;
  carrier?: string;
  totalValue?: string;
  note?: string;
  supplier: { legalName: string };
  items: OrderItem[];
  deliveries: Array<{
    id: string;
    invoiceNumber: string;
    deliveredAt: string;
    partial: boolean;
  }>;
};
type Tab = "demand" | "orders" | "receipt";
type SupplierOption = {
  id: string;
  legalName: string;
  tradeName?: string;
  cnpj?: string;
};

const number = (value: string | number) =>
  Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/purchases${path}`, {
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

function statusStyle(status: string) {
  if (status === "RECEBIDA") return "bg-green-50 text-green-700";
  if (status === "PARCIAL") return "bg-amber-50 text-amber-700";
  if (status === "CANCELADA") return "bg-red-50 text-red-700";
  return "bg-blue-50 text-blue-700";
}

export function Purchases({
  role,
  mode = "receiving",
}: {
  role: string;
  mode?: "planning" | "receiving";
}) {
  const cache = useQueryClient();
  const planning = mode === "planning";
  const canOrder = ["ADMIN", "COMPRAS"].includes(role);
  const canReceive = ["ADMIN", "ALMOXARIFADO"].includes(role);
  const [tab, setTab] = useState<Tab>(planning ? "demand" : "orders");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [orderNumber, setOrderNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [carrier, setCarrier] = useState("");
  const [success, setSuccess] = useState("");
  const [orderModalOpen, setOrderModalOpen] = useState(false);

  const demand = useQuery({
    queryKey: ["purchase-demand"],
    queryFn: () => request<DemandItem[]>("/demand"),
    enabled: planning,
  });
  const orders = useQuery({
    queryKey: ["purchase-orders", q],
    queryFn: () => request<Order[]>(`/orders?q=${encodeURIComponent(q)}`),
    enabled: tab === "orders",
  });
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const response = await fetch("/api/suppliers", {
        credentials: "include",
      });
      if (!response.ok)
        throw new Error("Não foi possível carregar os fornecedores.");
      return response.json() as Promise<SupplierOption[]>;
    },
    enabled: planning && canOrder,
  });
  const chosen = useMemo(
    () => demand.data?.filter((item) => selected[item.id]) || [],
    [demand.data, selected],
  );
  const requestGroups = useMemo(() => {
    const groups = new Map<
      string,
      { id: string; number: string; requestDate: string; items: DemandItem[] }
    >();
    for (const item of demand.data || []) {
      const group = groups.get(item.request.id) || {
        id: item.request.id,
        number: item.request.number,
        requestDate: item.request.requestDate,
        items: [],
      };
      group.items.push(item);
      groups.set(item.request.id, group);
    }
    return [...groups.values()];
  }, [demand.data]);
  const visibleRequestGroups = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("pt-BR");
    if (!term) return requestGroups;
    return requestGroups.filter(
      (group) =>
        group.number.toLocaleLowerCase("pt-BR").includes(term) ||
        group.items.some((item) =>
          `${item.description} ${item.product?.code || item.manualCode || ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(term),
        ),
    );
  }, [q, requestGroups]);
  const selectedRequestCount = requestGroups.filter((group) =>
    group.items.every((item) => selected[item.id]),
  ).length;
  const createOrder = useMutation({
    mutationFn: () =>
      request<Order>("/orders", {
        method: "POST",
        body: JSON.stringify({
          number: orderNumber,
          supplierName,
          acquiredAt: today(),
          expectedAt: expectedAt || undefined,
          carrier,
          items: chosen.map((item) => ({
            requestItemId: item.id,
            quantity: quantities[item.id] || item.openQuantity,
            unitPrice:
              prices[item.id] === "" || prices[item.id] == null
                ? undefined
                : prices[item.id],
          })),
        }),
      }),
    onSuccess: async (created) => {
      setSuccess(
        `Ordem Protheus ${created.number} registrada e vinculada às solicitações selecionadas.`,
      );
      setSelected({});
      setQuantities({});
      setPrices({});
      setOrderNumber("");
      setSupplierName("");
      setExpectedAt("");
      setCarrier("");
      setOrderModalOpen(false);
      await Promise.all(
        [
          ["purchase-demand"],
          ["purchase-orders"],
          ["requests"],
          ["dashboard"],
        ].map((queryKey) => cache.invalidateQueries({ queryKey })),
      );
      setTab(planning ? "demand" : "orders");
    },
  });

  const [typedOrder, setTypedOrder] = useState("");
  const [searchedOrder, setSearchedOrder] = useState("");
  const order = useQuery({
    queryKey: ["purchase-order-receipt", searchedOrder],
    queryFn: () =>
      request<Order>(`/orders/by-number/${encodeURIComponent(searchedOrder)}`),
    enabled: !!searchedOrder,
    retry: false,
  });
  const [receiptQuantities, setReceiptQuantities] = useState<
    Record<string, string>
  >({});
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [deliveredAt, setDeliveredAt] = useState(today());
  const [receiptNote, setReceiptNote] = useState("");
  useEffect(() => {
    if (order.data)
      setReceiptQuantities(
        Object.fromEntries(
          order.data.items
            .filter((item) => Number(item.openQuantity) > 0)
            .map((item) => [item.id, item.openQuantity]),
        ),
      );
  }, [order.data]);
  const receiptItems =
    order.data?.items
      .filter((item) => Number(receiptQuantities[item.id] || 0) > 0)
      .map((item) => ({
        orderItemId: item.id,
        quantity: receiptQuantities[item.id],
      })) || [];
  const receive = useMutation({
    mutationFn: () =>
      request(`/orders/${order.data?.id}/receipts`, {
        method: "POST",
        body: JSON.stringify({
          invoiceNumber,
          deliveredAt,
          note: receiptNote || undefined,
          items: receiptItems,
        }),
      }),
    onSuccess: async () => {
      setSuccess(
        `Nota Fiscal ${invoiceNumber.toUpperCase()} recebida. Solicitações, pedido e estoque foram atualizados.`,
      );
      setInvoiceNumber("");
      setReceiptNote("");
      setSearchedOrder("");
      setTypedOrder("");
      setReceiptQuantities({});
      await Promise.all(
        [
          ["purchase-demand"],
          ["purchase-orders"],
          ["purchase-order-receipt"],
          ["requests"],
          ["stock"],
          ["stock-history"],
          ["dashboard"],
        ].map((queryKey) => cache.invalidateQueries({ queryKey })),
      );
      setTab("orders");
    },
  });

  const selectRequest = (items: DemandItem[], checked: boolean) => {
    setSelected((current) => ({
      ...current,
      ...Object.fromEntries(items.map((item) => [item.id, checked])),
    }));
    if (checked)
      setQuantities((current) => ({
        ...current,
        ...Object.fromEntries(
          items.map((item) => [item.id, current[item.id] || item.openQuantity]),
        ),
      }));
  };
  const searchOrder = (event: FormEvent) => {
    event.preventDefault();
    setSuccess("");
    setSearchedOrder(typedOrder.trim());
  };

  return (
    <div className="space-y-6">
      <header
        className={`flex flex-wrap items-end justify-between gap-6 ${planning ? "relative overflow-hidden rounded-3xl bg-slate-950 px-7 py-8 text-white shadow-xl sm:px-9" : ""}`}
      >
        {planning && (
          <>
            <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-blue-600/30 blur-3xl" />
            <div className="absolute bottom-0 right-1/3 h-28 w-28 rounded-full bg-cyan-400/10 blur-2xl" />
          </>
        )}
        <div>
          <p
            className={`text-xs font-bold uppercase tracking-[.18em] ${planning ? "text-blue-300" : "text-blue-700"}`}
          >
            Fluxo de suprimentos
          </p>
          <h1
            className={`mt-2 font-bold tracking-tight ${planning ? "text-3xl sm:text-4xl" : "text-3xl"}`}
          >
            {planning ? "Pedidos internos recebidos" : "Pedidos e recebimentos"}
          </h1>
          <p
            className={`mt-2 max-w-2xl text-sm leading-6 ${planning ? "text-slate-300" : "text-slate-500"}`}
          >
            {planning
              ? "Converta os pedidos do almoxarifado em ordens de compra completas."
              : "Consulte as ordens emitidas e registre a entrada dos materiais."}
          </p>
        </div>
        {planning && (
          <div className="relative flex flex-wrap items-stretch gap-3">
            <div className="grid min-w-60 grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-blue-300">
                  Disponíveis
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {requestGroups.length || "—"}
                </p>
                <p className="text-xs text-slate-400">solicitações</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-blue-300">
                  Selecionados
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {selectedRequestCount}
                </p>
                <p className="text-xs text-slate-400">selecionadas</p>
              </div>
            </div>
            <button
              disabled={!chosen.length}
              onClick={() => setOrderModalOpen(true)}
              className="button min-h-full rounded-2xl bg-blue-600 px-6 shadow-lg shadow-blue-950/30 hover:bg-blue-500"
            >
              <Plus size={19} /> Gerar ordem ({selectedRequestCount})
            </button>
          </div>
        )}
        {!planning && (
          <div className="flex flex-wrap gap-2">
            {canReceive && (
              <button
                className="button bg-green-700 hover:bg-green-800"
                onClick={() => {
                  setTab("receipt");
                  setSuccess("");
                }}
              >
                <PackageCheck size={18} /> Receber material
              </button>
            )}
          </div>
        )}
      </header>
      {success && (
        <p
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          <CheckCircle2 className="mr-2 inline" size={18} />
          {success}
        </p>
      )}
      {!planning && (
        <nav className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-2">
          {[
            ["orders", ShoppingCart, "1. Pedidos", "Ordens emitidas"],
            ["receipt", PackageCheck, "2. Recebimento", "Pedido e Nota Fiscal"],
          ].map(([key, Icon, label, description]) => (
            <button
              key={String(key)}
              onClick={() => {
                setTab(key as Tab);
                setQ("");
                setSuccess("");
              }}
              className={`flex items-center gap-3 rounded-xl p-3 text-left transition ${tab === key ? "bg-blue-700 text-white" : "hover:bg-slate-50"}`}
            >
              <span
                className={`grid h-10 w-10 place-items-center rounded-lg ${tab === key ? "bg-white/15" : "bg-blue-50 text-blue-700"}`}
              >
                <Icon size={20} />
              </span>
              <span>
                <strong className="block text-sm">{String(label)}</strong>
                <small
                  className={tab === key ? "text-blue-100" : "text-slate-400"}
                >
                  {String(description)}
                </small>
              </span>
            </button>
          ))}
        </nav>
      )}

      {planning && tab === "demand" && (
        <div className="space-y-6">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b bg-slate-50/70 p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">
                    Etapa 1
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    Selecionar solicitações pendentes
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Selecione uma solicitação para incluir todos os seus
                    materiais pendentes.
                  </p>
                </div>
                <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700">
                  {selectedRequestCount} solicitação(ões)
                </span>
              </div>
              <label className="relative block">
                <Search
                  className="absolute left-3 top-3 text-slate-400"
                  size={18}
                />
                <input
                  className="input h-11 pl-10"
                  placeholder="Buscar solicitação, código ou material"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                />
              </label>
            </div>
            {demand.isPending ? (
              <p className="p-8 text-center text-slate-500">
                Carregando demanda…
              </p>
            ) : demand.isError ? (
              <p className="p-6 text-red-700">{demand.error.message}</p>
            ) : !visibleRequestGroups.length ? (
              <p className="p-10 text-center text-slate-500">
                Nenhuma solicitação pendente encontrada.
              </p>
            ) : (
              <div className="space-y-4 bg-slate-50/50 p-4 sm:p-6">
                {visibleRequestGroups.map((group) => {
                  const checked = group.items.every(
                    (item) => selected[item.id],
                  );
                  return (
                    <article
                      key={group.id}
                      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${checked ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300 hover:shadow-md"}`}
                    >
                      <div
                        className={`flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4 sm:px-6 ${checked ? "border-blue-100 bg-blue-50/80" : "border-slate-100 bg-white"}`}
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          {canOrder && (
                            <button
                              type="button"
                              aria-label={`${checked ? "Remover" : "Selecionar"} solicitação ${group.number}`}
                              onClick={() =>
                                selectRequest(group.items, !checked)
                              }
                              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 transition ${checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-transparent hover:border-blue-400"}`}
                            >
                              <Check size={20} strokeWidth={3} />
                            </button>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-bold text-slate-950">
                                Solicitação {group.number}
                              </h3>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${checked ? "bg-blue-600 text-white" : "bg-amber-50 text-amber-700"}`}
                              >
                                {checked ? "Selecionada" : "Aguardando ordem"}
                              </span>
                            </div>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                              <CalendarDays size={14} />
                              Solicitada em{" "}
                              {new Date(group.requestDate).toLocaleDateString(
                                "pt-BR",
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                            <PackageOpen size={16} className="text-blue-700" />
                            {group.items.length}{" "}
                            {group.items.length === 1
                              ? "material"
                              : "materiais"}
                          </span>
                          {canOrder && (
                            <button
                              type="button"
                              onClick={() =>
                                selectRequest(group.items, !checked)
                              }
                              className={`hidden rounded-xl px-4 py-2 text-xs font-bold transition sm:inline-flex ${checked ? "border border-blue-200 bg-white text-blue-700 hover:bg-blue-50" : "bg-blue-700 text-white hover:bg-blue-800"}`}
                            >
                              {checked
                                ? "Remover seleção"
                                : "Selecionar solicitação"}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="px-5 py-2 sm:px-6">
                        <div className="hidden grid-cols-[minmax(0,1fr)_150px_190px] gap-4 border-b border-slate-100 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:grid">
                          <span>Material</span>
                          <span>Código</span>
                          <span className="text-right">
                            Quantidade pendente
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {group.items.map((item) => (
                            <div
                              key={item.id}
                              className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_150px_190px] md:items-center md:gap-4"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold leading-5 text-slate-800">
                                  {item.description}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">
                                  Status atual: {item.status.label}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">
                                  Código
                                </p>
                                <span className="mt-1 inline-flex rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-700 md:mt-0">
                                  {item.product?.code ||
                                    item.manualCode ||
                                    "Sem código"}
                                </span>
                              </div>
                              <div className="md:text-right">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 md:hidden">
                                  Quantidade pendente
                                </p>
                                <p className="mt-1 text-base font-bold text-blue-700 md:mt-0">
                                  {number(item.openQuantity)}{" "}
                                  <span className="text-xs text-slate-500">
                                    {item.unit}
                                  </span>
                                </p>
                                {Number(item.purchasedQuantity) > 0 && (
                                  <p className="mt-0.5 text-[11px] text-slate-400">
                                    Solicitado: {number(item.requestedQuantity)}{" "}
                                    · já pedido:{" "}
                                    {number(item.purchasedQuantity)}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          {canOrder && orderModalOpen && (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
              onMouseDown={(event) => {
                if (
                  event.target === event.currentTarget &&
                  !createOrder.isPending
                )
                  setOrderModalOpen(false);
              }}
            >
              <section className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-gradient-to-r from-blue-50 to-white px-6 py-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">
                      Etapa 2
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">
                      Dados da ordem de compra
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Informe os dados da ordem emitida no Protheus e confira os
                      materiais.
                    </p>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-white px-4 py-3 text-right shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Solicitações
                    </p>
                    <p className="mt-1 text-xl font-bold text-blue-700">
                      {selectedRequestCount}
                    </p>
                  </div>
                  <button
                    aria-label="Fechar"
                    disabled={createOrder.isPending}
                    onClick={() => setOrderModalOpen(false)}
                    className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 hover:bg-slate-50"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 sm:p-7">
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                    <label className="block text-sm font-semibold">
                      Número da Ordem no Protheus *
                      <input
                        className="input mt-1.5"
                        maxLength={60}
                        value={orderNumber}
                        onChange={(event) => setOrderNumber(event.target.value)}
                        placeholder="Ex.: 000123"
                      />
                    </label>
                    <label className="block text-sm font-semibold">
                      Data de Entrega *
                      <input
                        type="date"
                        className="input mt-1.5"
                        value={expectedAt}
                        onChange={(event) => setExpectedAt(event.target.value)}
                      />
                    </label>
                    <label className="block text-sm font-semibold">
                      Fornecedor *
                      <select
                        className="input mt-1.5"
                        value={supplierName}
                        onChange={(event) =>
                          setSupplierName(event.target.value)
                        }
                      >
                        <option value="">Selecione o fornecedor</option>
                        {suppliers.data?.map((supplier) => (
                          <option value={supplier.legalName} key={supplier.id}>
                            {supplier.tradeName
                              ? `${supplier.tradeName} — ${supplier.legalName}`
                              : supplier.legalName}
                          </option>
                        ))}
                      </select>
                      {!suppliers.isLoading && !suppliers.data?.length && (
                        <span className="mt-1 block text-xs font-normal text-amber-700">
                          Cadastre um fornecedor no módulo Fornecedores.
                        </span>
                      )}
                    </label>
                    <label className="block text-sm font-semibold">
                      Transportadora *
                      <input
                        className="input mt-1.5"
                        maxLength={160}
                        value={carrier}
                        onChange={(event) => setCarrier(event.target.value)}
                        placeholder="Nome da transportadora"
                      />
                    </label>
                  </div>
                  <div className="mt-7">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-slate-900">
                          Materiais da ordem
                        </h3>
                        <p className="text-xs text-slate-500">
                          Itens e quantidades pendentes vinculados à ordem do
                          Protheus.
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-slate-500">
                        {chosen.length} item(ns)
                      </span>
                    </div>
                    {!chosen.length ? (
                      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                        <ShoppingCart
                          className="mx-auto text-slate-300"
                          size={32}
                        />
                        <p className="mt-3 font-semibold text-slate-600">
                          Nenhum material selecionado
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          Selecione ao menos um item na etapa acima.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {chosen.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-800">
                                  {item.description}
                                </p>
                                <p className="mt-1 text-xs font-medium text-blue-700">
                                  SC {item.request.number} ·{" "}
                                  {item.product?.code ||
                                    item.manualCode ||
                                    "Sem código"}
                                </p>
                              </div>
                              <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-500">
                                {item.unit}
                              </span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                              <label className="text-[11px] text-slate-500">
                                Quantidade
                                <input
                                  type="number"
                                  min="0.001"
                                  max={item.openQuantity}
                                  step="0.001"
                                  className="input mt-1 bg-white"
                                  value={quantities[item.id] || ""}
                                  onChange={(event) =>
                                    setQuantities((current) => ({
                                      ...current,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="text-[11px] text-slate-500">
                                Valor unitário
                                <input
                                  type="number"
                                  min="0"
                                  step="0.0001"
                                  className="input mt-1 bg-white"
                                  value={prices[item.id] || ""}
                                  onChange={(event) =>
                                    setPrices((current) => ({
                                      ...current,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-7 flex justify-end border-t border-slate-100 pt-6">
                    <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:min-w-80">
                      {createOrder.isError && (
                        <p
                          role="alert"
                          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                        >
                          {createOrder.error.message}
                        </p>
                      )}
                      <button
                        className="button h-12 w-full rounded-xl px-6 text-base shadow-lg shadow-blue-700/20"
                        disabled={
                          !chosen.length ||
                          !orderNumber.trim() ||
                          !supplierName.trim() ||
                          !expectedAt ||
                          !carrier.trim() ||
                          createOrder.isPending
                        }
                        onClick={() => createOrder.mutate()}
                      >
                        <Plus size={17} />
                        {createOrder.isPending
                          ? "Registrando ordem…"
                          : "Registrar ordem do Protheus"}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      {!planning && tab === "orders" && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b p-4">
            <label className="relative block">
              <Search
                className="absolute left-3 top-3 text-slate-400"
                size={18}
              />
              <input
                className="input h-11 pl-10"
                placeholder="Buscar pedido, fornecedor ou Nota Fiscal"
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
            </label>
          </div>
          {orders.isPending ? (
            <p className="p-8 text-center text-slate-500">
              Carregando pedidos…
            </p>
          ) : !orders.data?.length ? (
            <p className="p-10 text-center text-slate-500">
              Nenhum pedido encontrado.
            </p>
          ) : (
            <div className="divide-y">
              {orders.data.map((item) => (
                <article key={item.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-blue-700">
                          {item.number}
                        </h2>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.supplier.legalName} · {item.items.length} item(ns)
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Entrega:{" "}
                        {item.expectedAt
                          ? new Date(item.expectedAt).toLocaleDateString(
                              "pt-BR",
                            )
                          : "—"}{" "}
                        · Transportadora: {item.carrier || "—"}
                      </p>
                    </div>
                    {canReceive &&
                      item.status !== "RECEBIDA" &&
                      item.status !== "CANCELADA" && (
                        <button
                          className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700"
                          onClick={() => {
                            setTypedOrder(item.number);
                            setSearchedOrder(item.number);
                            setTab("receipt");
                          }}
                        >
                          Receber
                        </button>
                      )}
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {item.items.map((line) => (
                      <div
                        key={line.id}
                        className="rounded-lg bg-slate-50 p-3 text-sm"
                      >
                        <p className="truncate font-medium">
                          {line.description}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-blue-700">
                          {line.allocations
                            ?.map(
                              (allocation) =>
                                `SC ${allocation.requestItem.request.number}`,
                            )
                            .join(", ")}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Pedido: {number(line.quantity)} · Recebido:{" "}
                          {number(line.receivedQuantity)} ·{" "}
                          <strong className="text-amber-700">
                            Pendente: {number(line.openQuantity)} {line.unit}
                          </strong>
                        </p>
                      </div>
                    ))}
                  </div>
                  {item.deliveries.length > 0 && (
                    <p className="mt-3 text-xs text-slate-500">
                      NF(s):{" "}
                      {item.deliveries
                        .map((delivery) => delivery.invoiceNumber)
                        .join(", ")}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {!planning && tab === "receipt" && (
        <div className="space-y-5">
          <form
            onSubmit={searchOrder}
            className="rounded-2xl border border-blue-200 bg-blue-50 p-5"
          >
            <label className="block text-sm font-bold text-blue-950">
              Digite o número do pedido
              <div className="mt-2 flex gap-2">
                <input
                  autoFocus
                  className="input h-12 bg-white"
                  value={typedOrder}
                  onChange={(event) => setTypedOrder(event.target.value)}
                  placeholder="Ex.: OC-2026-00125"
                />
                <button className="button h-12" disabled={!typedOrder.trim()}>
                  <Search size={18} /> Buscar pedido
                </button>
              </div>
            </label>
          </form>
          {order.isFetching && (
            <p className="rounded-xl bg-white p-6 text-center text-slate-500">
              Localizando pedido…
            </p>
          )}
          {order.isError && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
            >
              {order.error.message}
            </p>
          )}
          {order.data && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">
                      Pedido {order.data.number}
                    </h2>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(order.data.status)}`}
                    >
                      {order.data.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Fornecedor: {order.data.supplier.legalName} ·
                    Transportadora: {order.data.carrier || "—"}
                  </p>
                </div>
                <div className="divide-y">
                  {order.data.items.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-3 p-5 sm:grid-cols-[1fr_170px]"
                    >
                      <div>
                        <p className="font-semibold">{item.description}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.product?.code || "Sem código de estoque"} ·
                          Pedido {number(item.quantity)} · Já recebido{" "}
                          {number(item.receivedQuantity)} · Pendente{" "}
                          {number(item.openQuantity)} {item.unit}
                        </p>
                      </div>
                      <label className="text-xs font-semibold text-slate-500">
                        Receber agora
                        <input
                          type="number"
                          className="input mt-1"
                          min="0"
                          max={item.openQuantity}
                          step="0.001"
                          disabled={Number(item.openQuantity) === 0}
                          value={receiptQuantities[item.id] || ""}
                          onChange={(event) =>
                            setReceiptQuantities((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </section>
              <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold">Dados do recebimento</h2>
                <div className="mt-5 space-y-4">
                  <label className="block text-sm font-semibold">
                    Número da Nota Fiscal *
                    <input
                      className="input mt-1.5"
                      maxLength={80}
                      value={invoiceNumber}
                      onChange={(event) => setInvoiceNumber(event.target.value)}
                      placeholder="Ex.: 000123456"
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Data do recebimento *
                    <input
                      type="date"
                      className="input mt-1.5"
                      value={deliveredAt}
                      onChange={(event) => setDeliveredAt(event.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Observação
                    <textarea
                      className="input mt-1.5 min-h-24"
                      maxLength={1000}
                      value={receiptNote}
                      onChange={(event) => setReceiptNote(event.target.value)}
                      placeholder="Avarias, lote ou observações da conferência"
                    />
                  </label>
                  <div className="rounded-xl bg-slate-50 p-3 text-sm">
                    <span className="text-slate-500">Itens com entrada:</span>{" "}
                    <strong>{receiptItems.length}</strong>
                  </div>
                  {receive.isError && (
                    <p
                      role="alert"
                      className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                    >
                      {receive.error.message}
                    </p>
                  )}
                  <button
                    className="button h-12 w-full bg-green-700 hover:bg-green-800"
                    disabled={
                      !canReceive ||
                      !invoiceNumber.trim() ||
                      !deliveredAt ||
                      !receiptItems.length ||
                      receive.isPending ||
                      order.data.status === "RECEBIDA"
                    }
                    onClick={() => receive.mutate()}
                  >
                    <PackageCheck size={18} />
                    {receive.isPending
                      ? "Confirmando…"
                      : "Confirmar recebimento"}
                  </button>
                  <p className="text-xs leading-5 text-slate-400">
                    Quantidades menores que o saldo registram recebimento
                    parcial. A entrada no estoque ocorre somente após a
                    confirmação.
                  </p>
                </div>
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
