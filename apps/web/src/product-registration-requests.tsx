import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardPlus,
  ExternalLink,
  Link2,
  PackagePlus,
  Ruler,
  Send,
} from "lucide-react";
import { useState, type FormEvent } from "react";

type RegistrationRequest = {
  id: string;
  description: string;
  unit: string;
  references: string;
  referenceLinks: string[];
  createdAt: string;
  createdBy: { name: string };
};

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(
      detail?.message || "Não foi possível concluir a solicitação.",
    );
  }
  return response.json();
}

const units = [
  "UN",
  "PC",
  "PCT",
  "CX",
  "KIT",
  "JG",
  "M",
  "M²",
  "M³",
  "KG",
  "G",
  "L",
  "ML",
  "RL",
  "PAR",
];

export function ProductRegistrationRequests() {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [references, setReferences] = useState("");
  const [links, setLinks] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const today = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
  }).format(new Date());

  const history = useQuery({
    queryKey: ["product-registration-requests"],
    queryFn: () =>
      requestApi<RegistrationRequest[]>("/product-registration-requests"),
  });

  const createRequest = useMutation({
    mutationFn: (payload: {
      description: string;
      unit: string;
      references: string;
      referenceLinks: string[];
    }) =>
      requestApi<RegistrationRequest>("/product-registration-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setDescription("");
      setUnit("");
      setReferences("");
      setLinks("");
      setError("");
      setMessage("Solicitação de cadastro enviada com sucesso.");
      queryClient.invalidateQueries({
        queryKey: ["product-registration-requests"],
      });
    },
    onError: (reason: Error) => {
      setMessage("");
      setError(reason.message);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    const referenceLinks = links
      .split(/\r?\n/)
      .map((link) => link.trim())
      .filter(Boolean);
    if (
      !description.trim() ||
      !unit ||
      !references.trim() ||
      !referenceLinks.length
    ) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }
    const invalidLink = referenceLinks.find((link) => {
      try {
        const parsed = new URL(link);
        return !["http:", "https:"].includes(parsed.protocol);
      } catch {
        return true;
      }
    });
    if (invalidLink) {
      setError(
        `Informe um link válido, incluindo http:// ou https://: ${invalidLink}`,
      );
      return;
    }
    createRequest.mutate({
      description: description.trim(),
      unit,
      references: references.trim(),
      referenceLinks,
    });
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-600/25 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-blue-300">
              <ClipboardPlus size={16} /> Catálogo de materiais
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Solicitação de Cadastro
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Solicite a inclusão de um material com todas as informações
              necessárias para sua identificação.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <CalendarDays className="text-blue-300" size={21} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Data da solicitação
              </p>
              <p className="text-sm font-semibold capitalize">{today}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.55fr)]">
        <form
          onSubmit={submit}
          className="rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-100 px-6 py-5">
            <h2 className="flex items-center gap-2 font-bold text-slate-950">
              <PackagePlus className="text-blue-700" size={20} />
              Dados do novo item
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Todos os campos abaixo são obrigatórios.
            </p>
          </div>
          <div className="space-y-5 p-6">
            <label className="block text-sm font-semibold text-slate-700">
              Descrição do item <span className="text-red-500">*</span>
              <textarea
                className="input mt-2 min-h-24"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Descreva o material de forma clara e completa"
                maxLength={500}
                required
              />
              <span className="mt-1 block text-right text-xs font-normal text-slate-400">
                {description.length}/500
              </span>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Unidade de medida <span className="text-red-500">*</span>
              <div className="relative mt-2">
                <Ruler
                  className="pointer-events-none absolute left-3.5 top-3 text-slate-400"
                  size={18}
                />
                <select
                  className="input h-11 pl-11"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  required
                >
                  <option value="">Selecione a unidade</option>
                  {units.map((current) => (
                    <option value={current} key={current}>
                      {current}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Referências <span className="text-red-500">*</span>
              <textarea
                className="input mt-2 min-h-28"
                value={references}
                onChange={(event) => setReferences(event.target.value)}
                placeholder="Informe marca, modelo, fabricante, código do fabricante ou outras referências"
                maxLength={2000}
                required
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Links de referência <span className="text-red-500">*</span>
              <div className="relative mt-2">
                <Link2
                  className="pointer-events-none absolute left-3.5 top-3 text-slate-400"
                  size={18}
                />
                <textarea
                  className="input min-h-28 pl-11"
                  value={links}
                  onChange={(event) => setLinks(event.target.value)}
                  placeholder={
                    "https://fabricante.com/item\nhttps://fornecedor.com/produto"
                  }
                  required
                />
              </div>
              <span className="mt-1 block text-xs font-normal text-slate-400">
                Informe um link completo por linha.
              </span>
            </label>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {message && (
              <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                <CheckCircle2 size={18} /> {message}
              </p>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-5">
              <button
                className="button h-11 px-6 shadow-lg shadow-blue-700/15"
                disabled={createRequest.isPending}
              >
                <Send size={17} />
                {createRequest.isPending
                  ? "Enviando..."
                  : "Enviar solicitação de cadastro"}
              </button>
            </div>
          </div>
        </form>

        <aside className="h-fit rounded-2xl border border-blue-100 bg-blue-50/70 p-6">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-700 text-white">
            <ClipboardPlus size={22} />
          </span>
          <h2 className="mt-5 font-bold text-slate-950">
            Como preencher corretamente
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
            <p>
              Use uma descrição objetiva, incluindo características que
              diferenciem o material.
            </p>
            <p>
              Nas referências, informe marca, modelo e código do fabricante
              sempre que disponíveis.
            </p>
            <p>
              Adicione links que permitam conferir visualmente ou tecnicamente o
              item solicitado.
            </p>
          </div>
          <div className="mt-6 rounded-xl border border-blue-100 bg-white p-4 text-xs leading-5 text-slate-500">
            A data e o usuário solicitante são registrados automaticamente para
            garantir a rastreabilidade.
          </div>
        </aside>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="font-bold text-slate-950">Solicitações realizadas</h2>
          <p className="mt-1 text-sm text-slate-500">
            Histórico dos pedidos de inclusão no catálogo.
          </p>
        </div>
        {history.isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Carregando solicitações...
          </div>
        ) : history.data?.length ? (
          <div className="divide-y divide-slate-100">
            {history.data.map((item) => (
              <article
                className="grid gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_110px_180px]"
                key={item.id}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {item.description}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-500">
                    {item.references}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.referenceLinks.map((link, index) => (
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        key={link}
                      >
                        Referência {index + 1} <ExternalLink size={12} />
                      </a>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Unidade
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-700">
                    {item.unit}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Solicitado em
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(item.createdAt))}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    por {item.createdBy.name}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center">
            <ClipboardPlus className="mx-auto text-slate-300" size={32} />
            <p className="mt-3 font-semibold text-slate-700">
              Nenhuma solicitação cadastrada
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Os novos registros aparecerão aqui.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
