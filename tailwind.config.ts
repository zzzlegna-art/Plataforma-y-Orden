import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
				display: ['Space Grotesk', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
				mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
					glow: 'hsl(var(--primary-glow))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				info: {
					DEFAULT: 'hsl(var(--info))',
					foreground: 'hsl(var(--info-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				chart: {
					'1': 'hsl(var(--chart-1))',
					'2': 'hsl(var(--chart-2))',
					'3': 'hsl(var(--chart-3))',
					'4': 'hsl(var(--chart-4))',
					'5': 'hsl(var(--chart-5))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			boxShadow: {
				elegant: 'var(--shadow-elegant)',
				glow: 'var(--shadow-glow)'
			},
			backgroundImage: {
				'gradient-primary': 'var(--gradient-primary)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'fade-in': {
					from: { opacity: '0', transform: 'translateY(6px)' },
					to: { opacity: '1', transform: 'translateY(0)' }
				},
				// Entrada con rebote suave para botones de confirmación.
				'pop-in': {
					'0%': { opacity: '0', transform: 'scale(0.85)' },
					'60%': { opacity: '1', transform: 'scale(1.05)' },
					'100%': { opacity: '1', transform: 'scale(1)' }
				},
				// Destello que cruza el botón de izquierda a derecha y sale por completo.
				// El destello mide 1/3 del botón y arranca fuera por la izquierda (-left-1/3);
				// 400% de su propio ancho lo deja justo fuera por la derecha. Entre el 60% y el
				// 100% descansa fuera de la vista y reinicia sin que se note (antes se quedaba
				// congelado a mitad del botón).
				shine: {
					'0%': { transform: 'translateX(0)' },
					'60%, 100%': { transform: 'translateX(400%)' }
				},
				// Logo que flota suavemente mientras carga la app.
				'logo-float': {
					'0%, 100%': { transform: 'translateY(0) scale(1) rotate(0deg)' },
					'25%': { transform: 'translateY(-4px) scale(1.06) rotate(-3deg)' },
					'75%': { transform: 'translateY(-4px) scale(1.06) rotate(3deg)' }
				},
				// Onda que se expande y se desvanece alrededor del botón (solo opacity/transform: sin parpadeos).
				'ring-out': {
					'0%': { opacity: '0.55', transform: 'scale(1)' },
					'70%, 100%': { opacity: '0', transform: 'scale(1.04, 1.4)' }
				},
				// Latido suave para llamar la atención sin molestar.
				'pulse-soft': {
					'0%, 100%': { boxShadow: '0 0 0 0 hsl(var(--primary) / 0.45)' },
					'50%': { boxShadow: '0 0 0 10px hsl(var(--primary) / 0)' }
				},
				// Barra de progreso sin porcentaje: un tramo que recorre la línea.
				'progress-indeterminate': {
					'0%': { transform: 'translateX(-100%)' },
					'100%': { transform: 'translateX(400%)' }
				},
				// Destello sobre una fila recién marcada (control físico), que se apaga hasta quedar
				// en el mismo tono de reposo que ya usa la fila (bg-success/10, bg-warning/10) para
				// que no haya un salto de color cuando termina la animación.
				'row-flash-success': {
					'0%': { backgroundColor: 'hsl(var(--success) / 0.45)' },
					'100%': { backgroundColor: 'hsl(var(--success) / 0.1)' }
				},
				'row-flash-warning': {
					'0%': { backgroundColor: 'hsl(var(--warning) / 0.45)' },
					'100%': { backgroundColor: 'hsl(var(--warning) / 0.1)' }
				},
				// Círculo y check que se dibujan con el trazo (usar pathLength={1} en el SVG).
				draw: {
					from: { strokeDashoffset: '1' },
					to: { strokeDashoffset: '0' }
				},
				// Sacudida horizontal para llamar la atención sobre un error (ej. credenciales inválidas).
				shake: {
					'0%, 100%': { transform: 'translateX(0)' },
					'20%, 60%': { transform: 'translateX(-6px)' },
					'40%, 80%': { transform: 'translateX(6px)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
				'pop-in': 'pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
				shine: 'shine 3s ease-in-out infinite',
				'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
				'ring-out': 'ring-out 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite',
				'logo-float': 'logo-float 2.2s ease-in-out infinite',
				'progress-indeterminate': 'progress-indeterminate 1.3s ease-in-out infinite',
				'row-flash-success': 'row-flash-success 0.8s ease-out',
				'row-flash-warning': 'row-flash-warning 0.8s ease-out',
				shake: 'shake 0.4s ease-in-out',
				'draw-circle': 'draw 0.35s ease-out forwards',
				'draw-check': 'draw 0.25s 0.3s ease-out forwards'
			}
		}
	},
	plugins: [tailwindcssAnimate],
} satisfies Config;
