import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  CreditCard,
  Globe2,
  Handshake,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

export type Supplier = {
  id: string;
  legalName: string;
  tradeName?: string;
  cnpj?: string;
  stateRegistration?: string;
  municipalRegistration?: string;
  contact?: string;
  phone?: string;
  email?: string;
  postalCode?: string;
  street?: string;
  addressNumber?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  country: string;
  website?: string;
  paymentTerms?: string;
  note?: string;
  active: boolean;
  createdAt: string;
};

type SupplierForm = {
  legalName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  municipalRegistration: string;
  contact: string;
  phone: string;
  email: string;
  postalCode: string;
  street: string;
  addressNumber: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  country: string;
  website: string;
  paymentTerms: string;
  note: string;
};

const emptyForm: SupplierForm = {
  legalName: "",
  tradeName: "",
  cnpj: "",
  stateRegistration: "",
  municipalRegistration: "",
  contact: "",
  phone: "",
  email: "",
  postalCode: "",
  street: "",
  addressNumber: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  country: "Brasil",
  website: "",
  paymentTerms: "",
  note: "",
};

async function supplierApi<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/suppliers${path}`, {
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

const digits = (value: string) => value.replace(/\D/g, "");
const formatCnpj = (value?: string) => {
  const current = digits(value || "").slice(0, 14);
  return current
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};
const formatPostalCode = (value?: string) =>
  digits(value || "")
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");

export function Suppliers({ role }: { role: string }) {
  const cache = useQueryClient();
  const canCreate = ["ADMIN", "COMPRAS"].includes(role);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [success, setSuccess] = useState("");

  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => supplierApi<Supplier[]>(),
  });
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return suppliers.data || [];
    return (suppliers.data || []).filter((supplier) =>
      [
        supplier.legalName,
        supplier.tradeName,
        supplier.cnpj,
        supplier.city,
        supplier.state,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [search, suppliers.data]);
  const completeCount = (suppliers.data || []).filter(
    (supplier) => supplier.cnpj && supplier.email && supplier.city,
  ).length;
  const cityCount = new Set(
    (suppliers.data || []).map((supplier) => supplier.city).filter(Boolean),
  ).size;

  const createSupplier = useMutation({
    mutationFn: () =>
      supplierApi<Supplier>("", {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: async () => {
      setModalOpen(false);
      setForm(emptyForm);
      setSuccess("Fornecedor cadastrado com sucesso.");
      await cache.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });

  const update = (field: keyof SupplierForm, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    createSupplier.mutate();
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-blue-300">
              <Handshake size={16} /> Rede de fornecimento
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Fornecedores
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Centralize os dados fiscais, comerciais e de contato utilizados
              nas ordens de compra.
            </p>
          </div>
          {canCreate ? (
            <button
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-950/30 hover:bg-blue-500"
              onClick={() => {
                setSuccess("");
                setModalOpen(true);
              }}
            >
              <Plus size={18} /> Cadastrar fornecedor
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-medium text-slate-300">
              <ShieldCheck size={17} className="text-blue-300" />
              Cadastro disponível para Compras e Administração
            </span>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Fornecedores ativos",
            value: suppliers.data?.length || 0,
            icon: Building2,
          },
          {
            label: "Cadastros completos",
            value: completeCount,
            icon: CheckCircle2,
          },
          { label: "Cidades atendidas", value: cityCount, icon: MapPin },
        ].map((card) => (
          <article
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            key={card.label}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  {card.label}
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-950">
                  {card.value}
                </p>
              </div>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <card.icon size={21} />
              </span>
            </div>
          </article>
        ))}
      </section>

      {success && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={18} /> {success}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-bold text-slate-950">
              Fornecedores cadastrados
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Cadastros disponíveis para utilização nas ordens de compra.
            </p>
          </div>
          <label className="relative w-full sm:w-80">
            <Search
              className="absolute left-3.5 top-3 text-slate-400"
              size={18}
            />
            <input
              className="input h-11 pl-11"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar razão social, CNPJ ou cidade"
            />
          </label>
        </div>
        {suppliers.isLoading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Carregando fornecedores...
          </div>
        ) : visible.length ? (
          <div className="divide-y divide-slate-100">
            {visible.map((supplier) => (
              <article
                className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(260px,1.3fr)_minmax(220px,1fr)_minmax(220px,1fr)]"
                key={supplier.id}
              >
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                      <Building2 size={19} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">
                        {supplier.legalName}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {supplier.tradeName || "Nome fantasia não informado"}
                      </p>
                      <span className="mt-2 inline-flex rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                        {supplier.cnpj
                          ? formatCnpj(supplier.cnpj)
                          : "Cadastro anterior sem CNPJ"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  <p className="flex items-center gap-2">
                    <Phone size={15} className="text-slate-400" />
                    {supplier.phone || "Telefone não informado"}
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail size={15} className="text-slate-400" />
                    <span className="truncate">
                      {supplier.email || "E-mail não informado"}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400">
                    Contato: {supplier.contact || "não informado"}
                  </p>
                </div>
                <div>
                  <p className="flex items-start gap-2 text-sm text-slate-600">
                    <MapPin
                      size={15}
                      className="mt-0.5 shrink-0 text-slate-400"
                    />
                    <span>
                      {supplier.city
                        ? `${supplier.city}/${supplier.state}`
                        : "Endereço não informado"}
                    </span>
                  </p>
                  {supplier.paymentTerms && (
                    <p className="mt-2 flex items-start gap-2 text-xs text-slate-500">
                      <CreditCard size={14} className="mt-0.5 shrink-0" />
                      {supplier.paymentTerms}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <Handshake className="mx-auto text-slate-300" size={34} />
            <p className="mt-3 font-semibold text-slate-700">
              Nenhum fornecedor encontrado
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {search
                ? "Revise os termos da busca."
                : "O setor de Compras pode iniciar o cadastro pelo botão acima."}
            </p>
          </div>
        )}
      </section>

      {modalOpen && canCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <form
            onSubmit={submit}
            className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white px-6 py-5 sm:px-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-700">
                  Compras e Administração
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">
                  Cadastrar fornecedor
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Preencha os dados empresariais para liberar o fornecedor nas
                  ordens.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"
                onClick={() => setModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-7 p-6 sm:p-8">
              <FormSection
                title="Dados empresariais"
                icon={<Building2 size={18} />}
              >
                <Field label="Razão social" required className="md:col-span-2">
                  <input
                    className="input mt-1.5"
                    value={form.legalName}
                    onChange={(event) =>
                      update("legalName", event.target.value)
                    }
                    maxLength={160}
                    required
                  />
                </Field>
                <Field label="Nome fantasia">
                  <input
                    className="input mt-1.5"
                    value={form.tradeName}
                    onChange={(event) =>
                      update("tradeName", event.target.value)
                    }
                    maxLength={160}
                  />
                </Field>
                <Field label="CNPJ" required>
                  <input
                    className="input mt-1.5"
                    value={form.cnpj}
                    onChange={(event) =>
                      update("cnpj", formatCnpj(event.target.value))
                    }
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    required
                  />
                </Field>
                <Field label="Inscrição estadual">
                  <input
                    className="input mt-1.5"
                    value={form.stateRegistration}
                    onChange={(event) =>
                      update("stateRegistration", event.target.value)
                    }
                    maxLength={30}
                  />
                </Field>
                <Field label="Inscrição municipal">
                  <input
                    className="input mt-1.5"
                    value={form.municipalRegistration}
                    onChange={(event) =>
                      update("municipalRegistration", event.target.value)
                    }
                    maxLength={30}
                  />
                </Field>
              </FormSection>

              <FormSection title="Contato" icon={<Phone size={18} />}>
                <Field label="Pessoa de contato" required>
                  <input
                    className="input mt-1.5"
                    value={form.contact}
                    onChange={(event) => update("contact", event.target.value)}
                    maxLength={120}
                    required
                  />
                </Field>
                <Field label="Telefone" required>
                  <input
                    className="input mt-1.5"
                    value={form.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    placeholder="(00) 00000-0000"
                    maxLength={30}
                    required
                  />
                </Field>
                <Field label="E-mail" required>
                  <input
                    type="email"
                    className="input mt-1.5"
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                    maxLength={160}
                    required
                  />
                </Field>
                <Field label="Site">
                  <div className="relative mt-1.5">
                    <Globe2
                      className="absolute left-3 top-2.5 text-slate-400"
                      size={18}
                    />
                    <input
                      type="url"
                      className="input pl-10"
                      value={form.website}
                      onChange={(event) =>
                        update("website", event.target.value)
                      }
                      placeholder="https://"
                    />
                  </div>
                </Field>
              </FormSection>

              <FormSection title="Endereço" icon={<MapPin size={18} />}>
                <Field label="CEP" required>
                  <input
                    className="input mt-1.5"
                    value={form.postalCode}
                    onChange={(event) =>
                      update("postalCode", formatPostalCode(event.target.value))
                    }
                    placeholder="00000-000"
                    inputMode="numeric"
                    required
                  />
                </Field>
                <Field label="Logradouro" required className="md:col-span-2">
                  <input
                    className="input mt-1.5"
                    value={form.street}
                    onChange={(event) => update("street", event.target.value)}
                    maxLength={180}
                    required
                  />
                </Field>
                <Field label="Número" required>
                  <input
                    className="input mt-1.5"
                    value={form.addressNumber}
                    onChange={(event) =>
                      update("addressNumber", event.target.value)
                    }
                    maxLength={20}
                    required
                  />
                </Field>
                <Field label="Complemento">
                  <input
                    className="input mt-1.5"
                    value={form.complement}
                    onChange={(event) =>
                      update("complement", event.target.value)
                    }
                    maxLength={100}
                  />
                </Field>
                <Field label="Bairro" required>
                  <input
                    className="input mt-1.5"
                    value={form.district}
                    onChange={(event) => update("district", event.target.value)}
                    maxLength={100}
                    required
                  />
                </Field>
                <Field label="Cidade" required>
                  <input
                    className="input mt-1.5"
                    value={form.city}
                    onChange={(event) => update("city", event.target.value)}
                    maxLength={100}
                    required
                  />
                </Field>
                <Field label="UF" required>
                  <input
                    className="input mt-1.5 uppercase"
                    value={form.state}
                    onChange={(event) =>
                      update(
                        "state",
                        event.target.value.replace(/[^a-z]/gi, "").slice(0, 2),
                      )
                    }
                    placeholder="SP"
                    maxLength={2}
                    required
                  />
                </Field>
                <Field label="País" required>
                  <input
                    className="input mt-1.5"
                    value={form.country}
                    onChange={(event) => update("country", event.target.value)}
                    maxLength={80}
                    required
                  />
                </Field>
              </FormSection>

              <FormSection
                title="Condições comerciais"
                icon={<CreditCard size={18} />}
              >
                <Field label="Condição de pagamento" className="md:col-span-2">
                  <input
                    className="input mt-1.5"
                    value={form.paymentTerms}
                    onChange={(event) =>
                      update("paymentTerms", event.target.value)
                    }
                    placeholder="Ex.: 28 dias, boleto bancário"
                    maxLength={200}
                  />
                </Field>
                <Field label="Observações" className="md:col-span-2">
                  <textarea
                    className="input mt-1.5 min-h-24"
                    value={form.note}
                    onChange={(event) => update("note", event.target.value)}
                    maxLength={1000}
                  />
                </Field>
              </FormSection>

              {createSupplier.isError && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {createSupplier.error.message}
                </p>
              )}
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-4 sm:px-8">
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="button h-11 rounded-xl px-6"
                disabled={createSupplier.isPending}
              >
                <Save size={17} />
                {createSupplier.isPending
                  ? "Salvando..."
                  : "Cadastrar fornecedor"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function FormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 border-b border-slate-100 pb-3 font-bold text-slate-900">
        <span className="text-blue-700">{icon}</span>
        {title}
      </h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`block text-sm font-semibold text-slate-700 ${className}`}
    >
      {label} {required && <span className="text-red-500">*</span>}
      {children}
    </label>
  );
}
