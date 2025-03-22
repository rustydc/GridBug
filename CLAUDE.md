# GridBug Project Guidelines

## Build & Development Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run serve` - Preview production build
- `npm run typecheck` - Run TypeScript type checking (use `tsc --noEmit`)

## Code Style Guidelines
- **Imports**: Group imports by source (React, external libs, internal components, types, utils)
- **Components**: Use functional components with React.FC type and explicit return types
- **State Management**: Use Zustand with temporal (zundo) for undo/redo functionality
- **Types**: Define interfaces in types.ts, maintain strict typing (noImplicitAny)
- **Naming**: 
  - PascalCase for components and interfaces
  - camelCase for functions, variables, and methods
  - Descriptive names: avoid abbreviations except for common ones (ID, URL)
- **Error Handling**: Use try/catch for async operations, provide user feedback for errors
- **Formatting**: 2-space indentation, semicolons, trailing commas in multi-line objects
- **CSS**: Use Material UI sx prop for styling with theme consistency

## Project Structure
This vector graphics editor uses React with TypeScript, Vite for building, MUI for UI components, and Zustand for state management.