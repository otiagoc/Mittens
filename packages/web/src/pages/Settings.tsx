import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi, type AgentProfile } from "@/lib/api";
import { useEffect, useState, useRef } from "react";
import { Save, User, Check, Camera } from "lucide-react";

export function Settings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["agent-profile"],
    queryFn: () => settingsApi.getProfile(),
  });

  const [form, setForm] = useState<AgentProfile>({});
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setField("photoUrl", reader.result as string);
    };
    reader.readAsDataURL(file);
  };

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

        {/* Foto de perfil */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Foto de perfil</label>
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center shrink-0 cursor-pointer"
              style={{ background: form.photoUrl ? "transparent" : "#e8efed", border: "2px dashed #8bb5a8" }}
              onClick={() => fileInputRef.current?.click()}
            >
              {form.photoUrl ? (
                <img src={form.photoUrl} alt="Foto" className="w-full h-full object-cover" />
              ) : (
                <Camera size={20} style={{ color: "#8bb5a8" }} />
              )}
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                style={{ background: "#e8efed", color: "#2c4d46" }}
              >
                Escolher ficheiro
              </button>
              {form.photoUrl && (
                <button
                  type="button"
                  onClick={() => setField("photoUrl", "")}
                  className="block text-xs transition-colors"
                  style={{ color: "#e74c3c" }}
                >
                  Remover foto
                </button>
              )}
              <p className="text-[10px]" style={{ color: "#a8b8b4" }}>JPG ou PNG · máx 2 MB</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handlePhotoUpload}
          />
        </div>

        <Field label="Nome completo" value={form.name ?? ""} onChange={(v) => setField("name", v)} />
        <Field label="Telefone" value={form.phone ?? ""} onChange={(v) => setField("phone", v)} placeholder="+351 ..." />
        <Field label="Email" value={form.email ?? ""} onChange={(v) => setField("email", v)} type="email" />
        <Field label="Agência" value={form.agency ?? ""} onChange={(v) => setField("agency", v)} placeholder="ex: D&D Group · RE/MAX" />
        <Field label="Licença AMI" value={form.amiLicense ?? ""} onChange={(v) => setField("amiLicense", v)} />

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
            className="flex items-center gap-2 text-white text-sm px-4 py-2 rounded-xl font-medium transition-opacity disabled:opacity-50 hover:opacity-90"
            style={{ background: "#2c4d46" }}
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
