import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi, type AgentProfile } from "@/lib/api";
import { useEffect, useState } from "react";
import { Save, User, Check } from "lucide-react";

export function Settings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["agent-profile"],
    queryFn: () => settingsApi.getProfile(),
  });

  const [form, setForm] = useState<AgentProfile>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (profile: AgentProfile) => settingsApi.updateProfile(profile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-profile"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (error) => window.alert(`Erro ao guardar perfil: ${error.message}`),
  });

  const setField = (key: keyof AgentProfile, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <User size={20} className="text-blue-500" />
          Definições
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Os teus contactos aparecem nos links públicos partilhados com clientes.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Perfil de agente</h2>

        <Field label="Nome completo" value={form.name ?? ""} onChange={(v) => setField("name", v)} />
        <Field label="Telefone" value={form.phone ?? ""} onChange={(v) => setField("phone", v)} placeholder="+351 ..." />
        <Field label="Email" value={form.email ?? ""} onChange={(v) => setField("email", v)} type="email" />
        <Field label="Agência" value={form.agency ?? ""} onChange={(v) => setField("agency", v)} placeholder="ex: D&D Group · RE/MAX" />
        <Field label="Licença AMI" value={form.amiLicense ?? ""} onChange={(v) => setField("amiLicense", v)} />
        <Field label="URL da foto" value={form.photoUrl ?? ""} onChange={(v) => setField("photoUrl", v)} placeholder="https://..." />

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            ID Telegram (recebe os alertas de imóveis)
          </label>
          <input
            type="text"
            value={form.telegramChatId ?? ""}
            onChange={(e) => setField("telegramChatId", e.target.value)}
            placeholder="ex: 8060090589"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Para descobrires o teu ID, envia <code className="bg-gray-100 px-1 rounded">/meu_id</code> ao bot <a href="https://t.me/m1ttens_bot" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">@m1ttens_bot</a> e cola o número aqui.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Apresentação curta</label>
          <textarea
            value={form.bio ?? ""}
            onChange={(e) => setField("bio", e.target.value)}
            rows={3}
            placeholder="Ex: Especialista em imóveis em Oeiras e Cascais. 10 anos de experiência..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          {saved && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <Check size={13} /> Guardado
            </span>
          )}
          <button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            {saveMutation.isPending ? "A guardar..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}
