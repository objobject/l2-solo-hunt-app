import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: '/l2-solo-hunt-app/',
    server: {
        host: true, // Listens on all addresses (0.0.0.0)
        port: 5173,
    }
});