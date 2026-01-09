# ASIP - AGC Strategic Innovation Playbook

AI-powered hypothesis generation and evaluation platform for strategic innovation.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-org%2Fasip&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,DATABASE_URL,GOOGLE_GENAI_API_KEY&envDescription=Required%20environment%20variables&envLink=https%3A%2F%2Fgithub.com%2Fyour-org%2Fasip%2Fblob%2Fmain%2F.env.example)

## Overview

ASIP (AGC Strategic Innovation Playbook) is a web application that leverages Google's Gemini AI to generate and evaluate business hypotheses based on market needs and technical capabilities. It implements the G-Method pipeline for systematic innovation discovery.

## Features

- 📊 **Project Management**: Organize innovation initiatives
- 🎯 **Resource Management**: Define target specifications and technical assets
- 🤖 **AI-Powered Analysis**: Generate hypotheses using Gemini AI
- 🔄 **Pipeline Execution**: Automated 5-step analysis process
- 📈 **Progress Tracking**: Real-time execution monitoring
- 📝 **Hypothesis Evaluation**: AI-driven evaluation and scoring

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Backend**: Next.js API Routes, Server Actions
- **Database**: PostgreSQL (via Supabase)
- **AI**: Google Gemini API
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS, shadcn/ui
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 20+ 
- npm or yarn
- Docker (optional, for containerized development)

### Quick Start (Mock Mode)

Run the application without external dependencies:

```bash
# Install dependencies
npm install

# Run in mock mode
NEXT_PUBLIC_MOCK_AUTH=true npm run dev
```

Visit http://localhost:3000

### Docker Development

```bash
# Run with Docker
docker run -d --name asip-dev \
  -p 3000:3000 \
  -v $(pwd):/app \
  -w /app \
  -e NEXT_PUBLIC_MOCK_AUTH=true \
  node:20-alpine \
  npm run dev

# View logs
docker logs -f asip-dev

# Stop container
docker stop asip-dev
```

### Production Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/asip.git
   cd asip
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

3. **Set up Supabase**
   - Create a Supabase project
   - Run migrations from `supabase/migrations/`
   - Configure authentication

4. **Get Google Gemini API key**
   - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Generate an API key

5. **Run the application**
   ```bash
   npm install
   npm run dev
   ```

## Environment Variables

See `.env.example` for all required variables:

- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `DATABASE_URL`: PostgreSQL connection string
- `GOOGLE_GENAI_API_KEY`: Google Gemini API key
- `NEXT_PUBLIC_MOCK_AUTH`: Enable mock mode (true/false)

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md)
- [Docker Guide](docs/DOCKER.md)

## Project Structure

```
src/
├── app/                # Next.js app router pages
│   ├── (auth)/        # Authenticated routes
│   ├── api/           # API endpoints
│   └── login/         # Authentication
├── components/        # React components
│   ├── project/       # Project-specific components
│   └── ui/           # Reusable UI components
├── lib/              # Utility functions
│   ├── asip/         # ASIP pipeline logic
│   ├── db/           # Database schemas
│   └── supabase/     # Supabase client
└── hooks/            # Custom React hooks
```

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run production server
npm start

# Run linting
npm run lint
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary and confidential.

## Support

For support, please contact the development team.# ASIP
