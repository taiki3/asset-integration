import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			agc: {
  				navy: 'hsl(var(--agc-navy))',
  				gold: 'hsl(var(--agc-gold))',
  				orange: 'hsl(var(--agc-orange))',
  				amber: 'hsl(var(--agc-amber))',
  				light: 'hsl(var(--agc-light))'
  			},
  			status: {
  				success: 'hsl(var(--status-success))',
  				warning: 'hsl(var(--status-warning))',
  				error: 'hsl(var(--status-error))',
  				info: 'hsl(var(--status-info))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontFamily: {
  			display: [
  				'Space Grotesk',
  				'Noto Sans JP',
  				'sans-serif'
  			],
  			sans: [
  				'Inter',
  				'Noto Sans JP',
  				'sans-serif'
  			],
  			mono: [
  				'JetBrains Mono',
  				'monospace'
  			]
  		},
  		fontWeight: {
  			thin: '100',
  			light: '200',
  			normal: '400',
  			bold: '700',
  			black: '900'
  		},
  		letterSpacing: {
  			tighter: '-0.03em',
  			tight: '-0.02em',
  			normal: '0',
  			wide: '0.01em',
  			wider: '0.05em',
  			widest: '0.1em'
  		},
  		transitionTimingFunction: {
  			'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)'
  		},
  		animation: {
  			'fade-in': 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
  			'slide-in': 'slideInRight 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
  			'scale-in': 'scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
  			'glow-pulse': 'glowPulse 2s ease-in-out infinite'
  		},
  		keyframes: {
  			fadeInUp: {
  				from: {
  					opacity: '0',
  					transform: 'translateY(24px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			slideInRight: {
  				from: {
  					opacity: '0',
  					transform: 'translateX(-24px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateX(0)'
  				}
  			},
  			scaleIn: {
  				from: {
  					opacity: '0',
  					transform: 'scale(0.95)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'scale(1)'
  				}
  			},
  			glowPulse: {
  				'0%, 100%': {
  					boxShadow: '0 0 20px hsl(var(--agc-gold) / 0.3)'
  				},
  				'50%': {
  					boxShadow: '0 0 40px hsl(var(--agc-gold) / 0.5)'
  				}
  			}
  		},
  		boxShadow: {
  			glow: '0 0 20px hsl(var(--agc-gold) / 0.3)',
  			'glow-lg': '0 0 40px hsl(var(--agc-gold) / 0.5)',
  			card: '0 4px 20px -4px hsl(var(--foreground) / 0.1)',
  			'card-hover': '0 10px 40px -10px hsl(var(--agc-gold) / 0.3)'
  		},
  		backdropBlur: {
  			xs: '2px'
  		}
  	}
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/typography'),
  ],
} satisfies Config;
