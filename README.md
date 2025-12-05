# Beer League Hockey Scheduler

A web application for generating fair hockey schedules for beer league seasons. Automatically balances late-night games, weekend slots, and opponent matchups across all teams.

## Features

- **Fair Scheduling**: Optimized algorithm to distribute late games and weekend slots evenly
- **CSV Import**: Upload ice time availability from spreadsheets
- **Division Support**: Handle two divisions playing on separate days
- **Fairness Reporting**: Detailed analytics showing schedule balance across teams
- **Manual Editing**: Swap games or remove slots as needed
- **CSV Export**: Download final schedule with fairness report

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + shadcn-ui components
- **State Management**: React hooks with localStorage persistence
- **Client-Side Only**: No backend required, runs entirely in browser

## Getting Started

### Prerequisites

- Node.js 16+ and npm (recommended: [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating))

### Installation

```sh
# Clone the repository
git clone https://github.com/workatplay-admin/puck-scheduler.git

# Navigate to the project directory
cd puck-scheduler

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Building for Production

```sh
npm run build
```

The built files will be in the `dist/` directory.

## Usage

1. **Upload Ice Times**: Import a CSV file with columns: Date, Start Time
2. **Add Teams**: Enter team names and assign them to Division A or Division B
3. **Generate Schedule**: Click to create an optimized fair schedule
4. **Review Fairness**: Check the fairness report for distribution metrics
5. **Export**: Download the final schedule as CSV

## Project Structure

```
src/
├── components/       # React UI components
│   ├── IceTimesTab.tsx
│   ├── TeamsTab.tsx
│   ├── ScheduleTab.tsx
│   ├── ExportTab.tsx
│   ├── FairnessReport.tsx
│   └── SettingsPanel.tsx
├── lib/             # Core scheduling logic
│   ├── scheduleGenerator.ts
│   ├── csvParser.ts
│   ├── csvExport.ts
│   └── algorithmTestHarness.ts
├── types/           # TypeScript definitions
│   └── scheduler.ts
└── pages/
    └── Index.tsx    # Main application
```

## Documentation

- **[PRD](docs/prd)**: Product Requirements Document
- **[ADR](docs/Beer_League_Hockey_Scheduler_Architecture.docx.md)**: Architectural Decision Record
- **[Implementation Plan](docs/implementation-plan.md)**: Phased development roadmap
- **[Phase 0 Baseline](docs/phase-0-baseline.md)**: Current algorithm performance metrics

## Testing

Run the algorithm performance test:

```sh
npm run test:algorithm
```

This generates baseline metrics for the scheduling algorithm.

## Development Workflow

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint
- `npm run test:algorithm` - Run scheduling algorithm performance tests

### Making Changes

1. Create a feature branch
2. Make your changes
3. Test locally with `npm run dev`
4. Build to verify: `npm run build`
5. Commit and push
6. Create a pull request

## Algorithm

The scheduler uses a greedy slot assignment algorithm with fairness penalties:

- **Phase 1**: Assign dates to divisions (alternating with balance)
- **Phase 2**: Generate matchups (round-robin with repeats)
- **Phase 3**: Assign matchups to slots (greedy with fairness scoring)
- **Phase 4**: Assign home/away designation

Future phases will implement simulated annealing optimization for improved fairness.

## Configuration

Settings can be adjusted in the UI:

- **Late Game Threshold**: Time at which games are considered "late" (default: 8:45 PM)
- **Late Slot Variance Flag**: Flag teams exceeding this variance (default: 2)
- **Weekend Variance Flag**: Flag teams exceeding this variance (default: 3)
- **Max Games Per Week**: Hard cap on games per team in any 7-day window (default: 3)

## Browser Compatibility

- Chrome, Firefox, Safari, Edge (latest 2 versions)
- Mobile browsers supported but not optimized

## License

Proprietary - All rights reserved

## Contributing

This is a private project. For questions or suggestions, please contact the repository administrators.

## Support

For issues or questions, please open an issue in the GitHub repository.
