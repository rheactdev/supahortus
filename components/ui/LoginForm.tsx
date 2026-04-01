"use client";
import { useState } from "react";

interface LoginFormProps {
    handleLogin: (e: React.SubmitEvent) => void;
    error: string;
    setError: (e: string) => void;

}

export const LoginForm = ({ handleLogin, error, setError }: LoginFormProps) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    return (
        <form onSubmit={handleLogin}>
            <fieldset className="fieldset bg-base-200 border-base-300 rounded-box w-xs border p-4">
                <legend className="fieldset-legend">Login</legend>

                <label className="label">Email</label>
                <input type="email" className="input" placeholder="Email" />

                <label className="label">Password</label>
                <input type="password" className="input" placeholder="Password" />

                <button className="btn btn-neutral mt-4">Login</button>
            </fieldset>
        </form>
    )
}