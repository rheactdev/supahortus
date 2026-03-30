export function DaisyUIForm({ label, descriptionText, placeholder, value, onChange, error }: { label: string, descriptionText: string, placeholder: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, error?: string }) {
    return (
        <fieldset className="fieldset my-4 w-full">
            <legend className="fieldset-legend">{label}</legend>
            <input type="text" className="input w-full" placeholder={placeholder} value={value} onChange={onChange} />
            <p className="label">{descriptionText}</p>
            {error && <p className="label text-error">{error}</p>}
        </fieldset>
    )
}