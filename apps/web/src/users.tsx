import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  KeyRound,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  UserRoundCog,
  UserX,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

type UserRecord = {
  id: string;
  name: string;
  login: string;
  role: "ADMIN" | "COMPRAS" | "ALMOXARIFADO" | "SOLICITANTE" | "CONSULTA";
  jobTitle?: string;
  active: boolean;
  mustChangePassword: boolean;
  lastAccessAt?: string;
  createdAt: string;
};

const roleLabels: Record<UserRecord["role"], string> = {
  ADMIN: "Administrador",
  COMPRAS: "Compras",
  ALMOXARIFADO: "Almoxarifado",
  SOLICITANTE: "Solicitante",
  CONSULTA: "Consulta",
};

async function usersApi<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/users${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(" ")
      : data?.message || "Não foi possível concluir a operação.";
    throw new Error(message);
  }
  return data as T;
}

function formatDate(value?: string) {
  if (!value) return "Ainda não acessou";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function Users() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<UserRecord | null>(null);
  const [feedback, setFeedback] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi<UserRecord[]>(),
  });
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return data;
    return data.filter((user) =>
      [user.name, user.login, user.jobTitle, roleLabels[user.role]]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [data, search]);

  const createUser = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      usersApi<UserRecord>("", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      setFeedback("Usuário criado. A senha informada é temporária.");
    },
  });
  const changeStatus = useMutation({
    mutationFn: ({ user, active }: { user: UserRecord; active: boolean }) =>
      usersApi<UserRecord>(`/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onSuccess: async (_, variables) => {
      await client.invalidateQueries({ queryKey: ["users"] });
      setFeedback(
        variables.active
          ? "Acesso do usuário reativado."
          : "Acesso desativado e sessões encerradas.",
      );
    },
  });
  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      usersApi<{ ok: true }>(`/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["users"] });
      setResetUser(null);
      setFeedback("Senha redefinida e sessões anteriores encerradas.");
    },
  });

  const active = data.filter((user) => user.active).length;
  const operational = data.filter((user) =>
    ["COMPRAS", "ALMOXARIFADO"].includes(user.role),
  ).length;
  const metrics: Array<[string, number, LucideIcon]> = [
    ["Usuários cadastrados", data.length, UserRoundCog],
    ["Acessos ativos", active, UserCheck],
    ["Equipes operacionais", operational, ShieldCheck],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.18em] text-blue-700">
            Administração
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            Usuários e acessos
          </h1>
          <p className="mt-2 text-slate-500">
            Controle os perfis, acessos e senhas temporárias do ERM.
          </p>
        </div>
        <button className="button h-11" onClick={() => setCreateOpen(true)}>
          <Plus size={18} /> Criar usuário
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map(([label, value, Icon]) => (
          <div className="card flex items-center gap-4" key={String(label)}>
            <span className="rounded-xl bg-blue-50 p-3 text-blue-700">
              <Icon size={22} />
            </span>
            <div>
              <p className="text-sm text-slate-500">{String(label)}</p>
              <p className="text-2xl font-bold text-slate-950">
                {String(value)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {feedback && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={17} /> {feedback}
          </span>
          <button onClick={() => setFeedback("")} aria-label="Fechar aviso">
            <X size={17} />
          </button>
        </div>
      )}

      <section className="card overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Equipe cadastrada</h2>
            <p className="text-sm text-slate-500">
              Desativar um usuário encerra imediatamente suas sessões.
            </p>
          </div>
          <label className="relative w-full sm:w-80">
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={18}
            />
            <input
              className="input pl-10"
              placeholder="Buscar nome, login ou perfil"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Usuário</th>
                <th className="px-5 py-3">Perfil</th>
                <th className="px-5 py-3">Último acesso</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((user) => (
                <tr
                  key={user.id}
                  className={!user.active ? "bg-slate-50/70" : ""}
                >
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500">
                      @{user.login}
                      {user.jobTitle ? ` · ${user.jobTitle}` : ""}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                      {roleLabels[user.role]}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {formatDate(user.lastAccessAt)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 font-semibold ${user.active ? "text-emerald-700" : "text-slate-400"}`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${user.active ? "bg-emerald-500" : "bg-slate-300"}`}
                      />
                      {user.active ? "Ativo" : "Inativo"}
                    </span>
                    {user.mustChangePassword && user.active && (
                      <p className="mt-1 text-xs text-amber-600">
                        Troca de senha pendente
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                        title="Redefinir senha"
                        onClick={() => setResetUser(user)}
                      >
                        <KeyRound size={17} />
                      </button>
                      <button
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-semibold ${user.active ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                        onClick={() =>
                          changeStatus.mutate({ user, active: !user.active })
                        }
                        disabled={changeStatus.isPending}
                      >
                        {user.active ? (
                          <UserX size={17} />
                        ) : (
                          <UserCheck size={17} />
                        )}
                        {user.active ? "Desativar" : "Reativar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && filtered.length === 0 && (
            <p className="p-10 text-center text-sm text-slate-500">
              Nenhum usuário encontrado.
            </p>
          )}
          {isLoading && (
            <p className="p-10 text-center text-sm text-slate-500">
              Carregando usuários…
            </p>
          )}
        </div>
      </section>

      {createOpen && (
        <UserModal
          title="Criar novo usuário"
          description="Defina o perfil de acesso e uma senha temporária de pelo menos 12 caracteres."
          pending={createUser.isPending}
          error={createUser.error?.message}
          onClose={() => setCreateOpen(false)}
          onSubmit={(form) =>
            createUser.mutate(Object.fromEntries(new FormData(form)))
          }
        />
      )}
      {resetUser && (
        <UserModal
          title={`Redefinir senha de ${resetUser.name}`}
          description="As sessões atuais serão encerradas e a nova senha será marcada como temporária."
          pending={resetPassword.isPending}
          error={resetPassword.error?.message}
          resetOnly
          onClose={() => setResetUser(null)}
          onSubmit={(form) => {
            const password = String(new FormData(form).get("password") || "");
            resetPassword.mutate({ id: resetUser.id, password });
          }}
        />
      )}
    </div>
  );
}

function UserModal({
  title,
  description,
  pending,
  error,
  resetOnly = false,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  pending: boolean;
  error?: string;
  resetOnly?: boolean;
  onClose: () => void;
  onSubmit: (form: HTMLFormElement) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(event.currentTarget);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          {!resetOnly && (
            <>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Nome completo
                <input
                  name="name"
                  className="input mt-1.5"
                  required
                  minLength={2}
                  autoFocus
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Login
                <input
                  name="login"
                  className="input mt-1.5"
                  required
                  minLength={3}
                  placeholder="nome.sobrenome"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Perfil de acesso
                <select
                  name="role"
                  className="input mt-1.5"
                  defaultValue="SOLICITANTE"
                  required
                >
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                Cargo / função{" "}
                <span className="font-normal text-slate-400">(opcional)</span>
                <input
                  name="jobTitle"
                  className="input mt-1.5"
                  maxLength={100}
                />
              </label>
            </>
          )}
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
            Senha temporária
            <input
              name="password"
              type="password"
              className="input mt-1.5"
              required
              minLength={12}
              autoComplete="new-password"
              autoFocus={resetOnly}
              placeholder="Mínimo de 12 caracteres"
            />
          </label>
          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-600"
          >
            Cancelar
          </button>
          <button className="button" disabled={pending}>
            {resetOnly ? <KeyRound size={17} /> : <Plus size={17} />}
            {pending
              ? "Salvando…"
              : resetOnly
                ? "Redefinir senha"
                : "Criar usuário"}
          </button>
        </div>
      </form>
    </div>
  );
}
