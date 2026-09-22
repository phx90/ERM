import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDownToLine,
  AlertTriangle,
  Boxes,
  History,
  Search,
  Settings2,
  X,
} from "lucide-react";

type Product = {
  id: string;
  code: string;
  genericDescription: string;
  unit: string | null;
  stockBalance: string;
  reservedBalance: string;
  availableBalance: string;
  minimumStock: string | null;
  stockVersion: number;
  _count: { movements: number };
};
type Movement = {
  id: string;
  productId: string;
  previousBalance: string;
  newBalance: string;
  origin: string;
  actorName: string | null;
  note: string | null;
  reference: string | null;
  createdAt: string;
  product: { code: string; genericDescription: string; unit: string | null };
};
type Position = {
  data: Product[];
  total: number;
  pageSize: number;
  summary: { all: number; zero: number; below: number };
};
type Action = "AJUSTE" | "MINIMO";
const labels: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  INICIAL: "Saldo inicial",
  AJUSTE: "Ajuste de contagem",
  MINIMO: "Estoque mínimo",
  IMPORTACAO: "Saldo importado",
  ENTREGA: "Recebimento",
};
const number = (value: string | number) =>
  Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/stock${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Sua sessão expirou. Entre novamente para continuar."
        : typeof data?.message === "string"
          ? data.message
          : "Não foi possível concluir a operação. Tente novamente.",
    );
  return data;
}
function operationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / 25));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm text-slate-500">
      <span>
        {total} registros · Página {page} de {pages}
      </span>
      <div className="flex gap-2">
        <button
          className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Anterior
        </button>
        <button
          className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
function MovementForm({
  product,
  action,
  onClose,
  onSaved,
}: {
  product: Product;
  action: Action;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState(
    action === "MINIMO" ? (product.minimumStock ?? "") : product.stockBalance,
  );
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [id] = useState(operationId);
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      action === "MINIMO"
        ? request(`/${product.id}/minimum`, {
            method: "PATCH",
            body: JSON.stringify({
              minimumStock: amount === "" ? null : amount,
            }),
          })
        : request(`/${product.id}/movements`, {
            method: "POST",
            body: JSON.stringify({
              type: action,
              quantity: amount,
              note,
              reference,
              operationId: id,
              version: product.stockVersion,
            }),
          }),
    onSuccess: async () => {
      await Promise.all(
        ["stock", "stock-history", "products", "dashboard"].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      onSaved();
    },
    onError: () => {
      cache.invalidateQueries({ queryKey: ["stock"] });
    },
  });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const reserved = Number(product.reservedBalance);
  const available = Number(product.availableBalance);
  const preview = Number(amount);
  const violatesReservation = action === "AJUSTE" && preview < reserved;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mutation.isPending) mutation.mutate();
  };
  return (
    <dialog
      ref={dialog}
      aria-labelledby="movement-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!mutation.isPending) onClose();
      }}
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl p-0 shadow-2xl backdrop:bg-slate-950/60"
    >
      <form onSubmit={submit}>
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Almoxarifado
            </p>
            <h2 id="movement-title" className="mt-1 text-xl font-bold">
              {labels[action]}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            disabled={mutation.isPending}
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-5 p-6">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="font-mono text-xs text-slate-500">{product.code}</p>
            <p className="mt-1 font-semibold">{product.genericDescription}</p>
            <p className="mt-2 text-sm text-slate-500">
              Saldo físico:{" "}
              <strong className="text-slate-900">
                {number(product.stockBalance)} {product.unit || "UN"}
              </strong>
            </p>
            {reserved > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                <p className="rounded-lg bg-amber-50 p-2 text-amber-700">
                  Reservado:{" "}
                  <strong>
                    {number(reserved)} {product.unit || "UN"}
                  </strong>
                </p>
                <p className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  Disponível:{" "}
                  <strong>
                    {number(available)} {product.unit || "UN"}
                  </strong>
                </p>
              </div>
            )}
          </div>
          <label className="block text-sm font-semibold">
            {action === "MINIMO"
              ? "Quantidade mínima"
              : "Quantidade contada fisicamente"}
            <input
              autoFocus
              type="number"
              min="0"
              max="999999999999.999"
              step="0.001"
              required={action !== "MINIMO"}
              className="input mt-2 h-11"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={mutation.isPending}
            />
          </label>
          {action === "MINIMO" ? (
            <p className="text-sm text-slate-500">
              O alerta aparece quando o saldo atingir ou ficar abaixo deste
              valor. Deixe vazio para remover o mínimo. Itens zerados continuam
              em destaque.
            </p>
          ) : (
            <>
              {amount !== "" && (
                <div
                  className={`rounded-xl p-4 text-sm ${preview < 0 || violatesReservation ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-800"}`}
                >
                  Saldo após a operação:{" "}
                  <strong>
                    {number(preview)} {product.unit || "UN"}
                  </strong>
                  {violatesReservation && (
                    <p className="mt-2 text-xs font-semibold">
                      Esta operação comprometeria materiais já reservados.
                    </p>
                  )}
                </div>
              )}
              <label className="block text-sm font-semibold">
                Referência{" "}
                <span className="font-normal text-slate-400">(opcional)</span>
                <input
                  className="input mt-2"
                  maxLength={120}
                  placeholder="Documento ou referência da contagem"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  disabled={mutation.isPending}
                />
              </label>
              <label className="block text-sm font-semibold">
                Motivo do ajuste (obrigatório)
                <textarea
                  className="input mt-2 min-h-24"
                  required
                  minLength={5}
                  maxLength={1000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={mutation.isPending}
                />
              </label>
              <p className="text-xs text-slate-500">
                Informe o saldo correto contado. A diferença será registrada no
                histórico, sem apagar movimentações anteriores.
              </p>
            </>
          )}
          {mutation.isError && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {mutation.error.message}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 p-5">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancelar
          </button>
          <button
            className="button"
            disabled={
              mutation.isPending ||
              (action !== "MINIMO" && (preview < 0 || violatesReservation))
            }
          >
            {mutation.isPending
              ? "Registrando…"
              : action === "MINIMO"
                ? "Salvar mínimo"
                : "Confirmar ajuste"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function Stock({ role }: { role: string }) {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"position" | "history">("position");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(params.get("status") || "");
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [selected, setSelected] = useState<Product | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [origin, setOrigin] = useState("");
  const [success, setSuccess] = useState("");
  const writable = ["ADMIN", "ALMOXARIFADO"].includes(role);
  const stock = useQuery({
    queryKey: ["stock", q, status, page],
    queryFn: () =>
      request<Position>(
        `?${new URLSearchParams({ q, status, page: String(page) })}`,
      ),
    refetchInterval: 30000,
  });
  const history = useQuery({
    queryKey: [
      "stock-history",
      historyProduct?.id,
      historyPage,
      from,
      to,
      origin,
    ],
    queryFn: () =>
      request<{ data: Movement[]; total: number }>(
        `/movements?${new URLSearchParams({ productId: historyProduct?.id || "", page: String(historyPage), from, to, origin })}`,
      ),
    enabled: tab === "history",
    refetchInterval: 30000,
  });
  const open = (product: Product, next: Action) => {
    setSelected(product);
    setAction(next);
    setSuccess("");
  };
  const filter = (next: string) => {
    setStatus(next);
    setPage(1);
    setTab("position");
  };
  const showHistory = (product: Product | null) => {
    setHistoryProduct(product);
    setHistoryPage(1);
    setTab("history");
  };
  const summary = stock.data?.summary;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">
            Almoxarifado
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Controle de estoque
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Saldos integrados aos recebimentos e retiradas, com ajuste manual
            restrito à conferência física.
          </p>
        </div>
        <Link
          to="/produtos"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
        >
          Catálogo de produtos
        </Link>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Produtos ativos",
            value: summary?.all,
            filter: "",
            color: "text-blue-700",
            icon: Boxes,
          },
          {
            label: "Sem estoque",
            value: summary?.zero,
            filter: "zero",
            color: "text-red-600",
            icon: AlertTriangle,
          },
          {
            label: "No mínimo ou abaixo",
            value: summary?.below,
            filter: "low",
            color: "text-amber-600",
            icon: ArrowDownToLine,
          },
        ].map((card) => (
          <button
            key={card.label}
            onClick={() => filter(card.filter)}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/60"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{card.label}</span>
              <card.icon size={21} className={card.color} />
            </div>
            <p className={`mt-3 text-3xl font-bold ${card.color}`}>
              {card.value ?? "—"}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {card.filter === "low"
                ? "Itens com saldo positivo que precisam de reposição"
                : card.filter === "zero"
                  ? "Itens sem disponibilidade para saída"
                  : "Consultar posição de estoque"}
            </p>
          </button>
        ))}
      </div>
      {success && (
        <p
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {success}
        </p>
      )}
      {!writable && (
        <p className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
          Seu acesso permite consultar saldos e movimentações.
        </p>
      )}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("position")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${tab === "position" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}
        >
          <Boxes size={17} /> Posição de estoque
        </button>
        <button
          onClick={() => showHistory(null)}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${tab === "history" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}
        >
          <History size={17} /> Movimentações
        </button>
      </div>
      {tab === "position" ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
            <label className="relative min-w-56 flex-1">
              <Search
                size={18}
                className="absolute left-3 top-3 text-slate-400"
              />
              <input
                aria-label="Buscar produto"
                style={{ paddingLeft: 40 }}
                className="input h-11"
                placeholder="Buscar código ou descrição"
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <select
              aria-label="Situação do estoque"
              style={{ width: "auto" }}
              className="input h-11"
              value={status}
              onChange={(event) => filter(event.target.value)}
            >
              <option value="">Todos os produtos</option>
              <option value="attention">Precisam de atenção</option>
              <option value="zero">Sem estoque</option>
              <option value="low">No mínimo ou abaixo</option>
            </select>
          </div>
          {stock.isError ? (
            <p role="alert" className="p-6 text-red-700">
              {stock.error.message}{" "}
              <button className="underline" onClick={() => stock.refetch()}>
                Tentar novamente
              </button>
            </p>
          ) : stock.isPending ? (
            <p className="p-8 text-center text-slate-500">
              Carregando estoque…
            </p>
          ) : !stock.data?.data.length ? (
            <div className="p-10 text-center">
              <Boxes className="mx-auto mb-3 text-slate-300" size={36} />
              <p className="font-semibold">Nenhum produto encontrado</p>
              <p className="mt-2 text-sm text-slate-500">
                Ajuste os filtros ou cadastre um produto no catálogo.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-4">Produto</th>
                    <th className="p-4 text-right">Saldo físico</th>
                    <th className="p-4 text-right">Reservado</th>
                    <th className="p-4 text-right">Disponível</th>
                    <th className="p-4 text-right">Mínimo</th>
                    <th className="p-4">Situação</th>
                    <th className="p-4">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.data.data.map((product) => {
                    const zero = Number(product.availableBalance) <= 0;
                    const low =
                      product.minimumStock !== null &&
                      Number(product.availableBalance) <=
                        Number(product.minimumStock);
                    return (
                      <tr
                        key={product.id}
                        className="border-t border-slate-100 align-top hover:bg-slate-50/70"
                      >
                        <td className="max-w-sm p-4">
                          <p className="font-semibold text-slate-800">
                            {product.genericDescription}
                          </p>
                          <p className="mt-1 font-mono text-xs text-slate-400">
                            {product.code}
                          </p>
                        </td>
                        <td className="whitespace-nowrap p-4 text-right">
                          <strong className="text-slate-900">
                            {number(product.stockBalance)}
                          </strong>
                          <span className="ml-1 text-xs text-slate-400">
                            {product.unit || "UN"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap p-4 text-right">
                          <strong
                            className={
                              Number(product.reservedBalance) > 0
                                ? "text-amber-700"
                                : "text-slate-400"
                            }
                          >
                            {number(product.reservedBalance)}
                          </strong>
                          <span className="ml-1 text-xs text-slate-400">
                            {product.unit || "UN"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap p-4 text-right">
                          <strong
                            className={
                              zero ? "text-red-600" : "text-emerald-700"
                            }
                          >
                            {number(product.availableBalance)}
                          </strong>
                          <span className="ml-1 text-xs text-slate-400">
                            {product.unit || "UN"}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {product.minimumStock === null
                            ? "—"
                            : number(product.minimumStock)}
                        </td>
                        <td className="p-4">
                          <span
                            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${zero ? "bg-red-50 text-red-700" : low ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}
                          >
                            {zero
                              ? "Sem estoque"
                              : low
                                ? "Estoque baixo"
                                : "Disponível"}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            {writable && (
                              <button
                                onClick={() => open(product, "AJUSTE")}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                              >
                                <Settings2 size={14} /> Ajustar contagem
                              </button>
                            )}
                            <button
                              onClick={() => showHistory(product)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-800"
                            >
                              Histórico
                            </button>
                          </div>
                          {writable && (
                            <div className="mt-3 flex flex-wrap gap-3 text-xs">
                              <button
                                onClick={() => open(product, "MINIMO")}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                              >
                                <Settings2 size={12} /> Definir mínimo
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            page={page}
            total={stock.data?.total || 0}
            onChange={setPage}
          />
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-4 border-b border-slate-200 p-4">
            {historyProduct && (
              <div className="flex items-center justify-between rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                <span>
                  Histórico:{" "}
                  <strong>
                    {historyProduct.code} — {historyProduct.genericDescription}
                  </strong>
                </span>
                <button
                  className="ml-3 underline"
                  onClick={() => showHistory(null)}
                >
                  Todos os produtos
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-slate-500">
                De
                <input
                  type="date"
                  className="input mt-1"
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setHistoryPage(1);
                  }}
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Até
                <input
                  type="date"
                  className="input mt-1"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setHistoryPage(1);
                  }}
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Tipo
                <select
                  className="input mt-1"
                  value={origin}
                  onChange={(event) => {
                    setOrigin(event.target.value);
                    setHistoryPage(1);
                  }}
                >
                  <option value="">Todas as movimentações</option>
                  {Object.entries(labels)
                    .filter(([key]) => key !== "MINIMO")
                    .map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </div>
          {history.isError ? (
            <p role="alert" className="p-6 text-red-700">
              {history.error.message}
            </p>
          ) : history.isPending ? (
            <p className="p-8 text-center text-slate-500">
              Carregando movimentações…
            </p>
          ) : !history.data?.data.length ? (
            <p className="p-10 text-center text-slate-500">
              Nenhuma movimentação neste período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      "Data / Responsável",
                      "Produto",
                      "Tipo",
                      "Quantidade",
                      "Saldo anterior → atual",
                      "Observação / Referência",
                    ].map((title) => (
                      <th key={title} className="p-4">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.data.data.map((movement) => {
                    const delta =
                      Number(movement.newBalance) -
                      Number(movement.previousBalance);
                    return (
                      <tr
                        key={movement.id}
                        className="border-t border-slate-100 align-top"
                      >
                        <td className="whitespace-nowrap p-4">
                          <p>
                            {new Date(movement.createdAt).toLocaleString(
                              "pt-BR",
                              { timeZone: "America/Sao_Paulo" },
                            )}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {movement.actorName || "Registro anterior"}
                          </p>
                        </td>
                        <td className="max-w-xs p-4">
                          <p className="font-semibold">
                            {movement.product.genericDescription}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {movement.product.code}
                          </p>
                        </td>
                        <td className="whitespace-nowrap p-4">
                          {labels[movement.origin] || movement.origin}
                        </td>
                        <td
                          className={`whitespace-nowrap p-4 font-semibold ${delta < 0 ? "text-red-600" : "text-green-700"}`}
                        >
                          {delta > 0 ? "+" : ""}
                          {number(delta)} {movement.product.unit || "UN"}
                        </td>
                        <td className="whitespace-nowrap p-4">
                          {number(movement.previousBalance)} →{" "}
                          <strong>{number(movement.newBalance)}</strong>
                        </td>
                        <td className="max-w-sm break-words p-4 text-slate-500">
                          {movement.note || "—"}
                          {movement.reference && (
                            <p className="mt-1 text-xs text-blue-700">
                              Ref.: {movement.reference}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            page={historyPage}
            total={history.data?.total || 0}
            onChange={setHistoryPage}
          />
        </section>
      )}
      <p className="text-xs text-slate-400">
        Entradas são registradas pelo recebimento das ordens e saídas pela baixa
        das retiradas. O ajuste de contagem existe apenas para corrigir o saldo
        após uma conferência física.
      </p>
      {selected && action && (
        <MovementForm
          key={`${selected.id}-${action}`}
          product={selected}
          action={action}
          onClose={() => {
            setSelected(null);
            setAction(null);
          }}
          onSaved={() => {
            setSuccess(
              action === "MINIMO"
                ? "Estoque mínimo atualizado."
                : "Ajuste de contagem registrado. Saldo e histórico atualizados.",
            );
            setSelected(null);
            setAction(null);
          }}
        />
      )}
    </div>
  );
}
