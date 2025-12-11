# Dependency Audit Report
*Generated: 2025-12-11*

## Executive Summary

This audit identified **4 security vulnerabilities** (1 high, 3 moderate), **14 outdated packages** with major version updates available, and **30+ unused UI components** contributing to significant bundle bloat (~250 production dependencies).

### Priority Actions Required

1. **CRITICAL**: Fix security vulnerabilities in Vite, esbuild, glob, and js-yaml
2. **HIGH**: Remove 30+ unused UI components and their Radix dependencies
3. **MEDIUM**: Update outdated packages to latest stable versions
4. **LOW**: Consider upgrading to React 19 (requires testing)

---

## 1. Security Vulnerabilities

### High Severity

**📛 glob** (10.2.0 - 10.4.5)
- **Issue**: Command injection via CLI with shell:true
- **CVSS**: 7.5 (High)
- **Advisory**: [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2)
- **Fix**: Run `npm audit fix`

### Moderate Severity

**⚠️ esbuild** (<=0.24.2)
- **Issue**: Development server can receive/read unauthorized requests
- **CVSS**: 5.3 (Moderate)
- **Advisory**: [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
- **Fix**: Update via Vite update

**⚠️ js-yaml** (4.0.0 - 4.1.0)
- **Issue**: Prototype pollution in merge operator
- **CVSS**: 5.3 (Moderate)
- **Advisory**: [GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m)
- **Fix**: Run `npm audit fix`

**⚠️ vite** (<=5.4.19)
- **Issues**:
  - File serving vulnerability with public directory
  - `server.fs` settings not applied to HTML
  - `server.fs.deny` bypass on Windows
- **Advisory**: Multiple GHSA advisories
- **Fix**: Update to Vite 6.1.6+

### Immediate Action

```bash
npm audit fix
npm install vite@latest
```

---

## 2. Outdated Packages

### Major Version Updates Available

| Package | Current | Latest | Impact | Priority |
|---------|---------|--------|--------|----------|
| `@hookform/resolvers` | 3.10.0 | 5.2.2 | May require API changes | High |
| `date-fns` | 3.6.0 | 4.1.0 | Breaking changes likely | Medium |
| `react` / `react-dom` | 18.3.1 | 19.2.2 | Major framework update | Low* |
| `react-day-picker` | 8.10.1 | 9.12.0 | API changes expected | Medium |
| `react-resizable-panels` | 2.1.9 | 3.0.6 | Check changelog | Medium |
| `react-router-dom` | 6.30.2 | 7.10.1 | Major routing changes | High |
| `recharts` | 2.15.4 | 3.5.1 | Chart API changes | Medium |
| `sonner` | 1.7.4 | 2.0.7 | Toast notification changes | Low |
| `tailwind-merge` | 2.6.0 | 3.4.0 | Utility function changes | Low |
| `vaul` | 0.9.9 | 1.1.2 | Drawer component changes | Low |
| `zod` | 3.25.76 | 4.1.13 | Schema validation changes | High |

\* React 19 update requires comprehensive testing across all components

### Minor/Patch Updates

| Package | Current | Latest |
|---------|---------|--------|
| `lucide-react` | 0.462.0 | 0.560.0 |
| `next-themes` | 0.3.0 | 0.4.6 |

### Recommended Update Strategy

1. **Phase 1 - Security & Minor Updates** (Immediate)
   ```bash
   npm update lucide-react next-themes
   npm audit fix
   ```

2. **Phase 2 - Major Updates** (After testing)
   ```bash
   # Update individual packages with caution
   npm install @hookform/resolvers@latest
   npm install zod@latest
   npm install react-router-dom@latest
   # Test thoroughly after each update
   ```

3. **Phase 3 - React 19** (Future consideration)
   - Requires comprehensive testing
   - Update all React-dependent packages
   - Check Radix UI compatibility

---

## 3. Unused Dependencies & Bundle Bloat

### Critical Finding: 30+ Unused UI Components

The project includes a complete shadcn/ui library installation but only uses **15 out of 48** components.

#### Actually Used Components (15)
- ✅ alert / alert-dialog
- ✅ badge
- ✅ button
- ✅ card
- ✅ collapsible
- ✅ input
- ✅ label
- ✅ select
- ✅ sheet
- ✅ sonner
- ✅ toast / toaster
- ✅ tooltip

#### Unused Components (33)
Can be safely removed:

**Never imported anywhere:**
- ❌ accordion
- ❌ aspect-ratio
- ❌ avatar
- ❌ breadcrumb
- ❌ chart
- ❌ checkbox
- ❌ context-menu
- ❌ drawer
- ❌ dropdown-menu
- ❌ hover-card
- ❌ input-otp
- ❌ menubar
- ❌ navigation-menu
- ❌ popover
- ❌ progress
- ❌ radio-group
- ❌ resizable
- ❌ scroll-area
- ❌ slider
- ❌ switch
- ❌ table
- ❌ tabs
- ❌ textarea

**Only used internally by other unused components:**
- ❌ calendar (only in unused components)
- ❌ carousel (only in unused components)
- ❌ command (only in unused components)
- ❌ dialog (only referenced by command)
- ❌ pagination (only in unused components)
- ❌ sidebar (likely unused in main app)
- ❌ separator (only via sidebar)
- ❌ skeleton (only via sidebar)
- ❌ form (only via hooks)
- ❌ toggle / toggle-group (only internal refs)

### Corresponding Radix UI Dependencies to Remove

After removing unused components, these Radix dependencies can be uninstalled:

```json
{
  "@radix-ui/react-accordion": "^1.2.11",
  "@radix-ui/react-aspect-ratio": "^1.1.7",
  "@radix-ui/react-avatar": "^1.1.10",
  "@radix-ui/react-checkbox": "^1.3.2",
  "@radix-ui/react-context-menu": "^2.2.15",
  "@radix-ui/react-dropdown-menu": "^2.1.15",
  "@radix-ui/react-hover-card": "^1.1.14",
  "@radix-ui/react-menubar": "^1.1.15",
  "@radix-ui/react-navigation-menu": "^1.2.13",
  "@radix-ui/react-popover": "^1.1.14",
  "@radix-ui/react-progress": "^1.1.7",
  "@radix-ui/react-radio-group": "^1.3.7",
  "@radix-ui/react-scroll-area": "^1.2.9",
  "@radix-ui/react-slider": "^1.3.5",
  "@radix-ui/react-switch": "^1.2.5",
  "@radix-ui/react-tabs": "^1.1.12",
  "@radix-ui/react-toggle": "^1.1.9",
  "@radix-ui/react-toggle-group": "^1.1.10"
}
```

### Other Potentially Unused Dependencies

**Verify usage:**
- `cmdk` - Only if command palette is used
- `embla-carousel-react` - Only if carousel is used
- `input-otp` - Only if OTP input is used
- `react-day-picker` - Only if calendar/date picker is used
- `recharts` - Only if charts are used
- `vaul` - Only if drawer is used

### Estimated Savings

- **~18 Radix packages** can be removed
- **~33 UI component files** can be deleted
- **Estimated bundle size reduction**: 200-400 KB (gzipped)
- **node_modules reduction**: ~50-100 MB

---

## 4. Recommendations

### Immediate Actions (This Week)

1. **Fix Security Vulnerabilities**
   ```bash
   npm audit fix
   npm install vite@latest
   npm test  # Verify everything works
   ```

2. **Remove Unused UI Components**
   ```bash
   # Remove unused component files
   rm src/components/ui/{accordion,aspect-ratio,avatar,breadcrumb,chart}.tsx
   rm src/components/ui/{checkbox,context-menu,drawer,dropdown-menu,hover-card}.tsx
   rm src/components/ui/{input-otp,menubar,navigation-menu,popover,progress}.tsx
   rm src/components/ui/{radio-group,resizable,scroll-area,slider,switch}.tsx
   rm src/components/ui/{table,tabs,textarea}.tsx
   # Consider removing: calendar,carousel,command,dialog,pagination,sidebar,separator,skeleton,form,toggle,toggle-group

   # Then remove corresponding npm packages
   npm uninstall @radix-ui/react-accordion @radix-ui/react-aspect-ratio \
     @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-context-menu \
     @radix-ui/react-dropdown-menu @radix-ui/react-hover-card @radix-ui/react-menubar \
     @radix-ui/react-navigation-menu @radix-ui/react-popover @radix-ui/react-progress \
     @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-slider \
     @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toggle \
     @radix-ui/react-toggle-group
   ```

3. **Update Minor Versions**
   ```bash
   npm update lucide-react next-themes
   ```

### Short-term Actions (This Month)

4. **Update Critical Packages with Major Versions**
   ```bash
   # Test each update individually
   npm install @hookform/resolvers@latest
   npm run build && npm test

   npm install zod@latest
   npm run build && npm test

   npm install react-router-dom@latest
   npm run build && npm test
   ```

5. **Audit Actually Used vs Declared Dependencies**
   - Verify if `cmdk`, `embla-carousel-react`, `input-otp`, `react-day-picker`, `recharts`, `vaul` are actually used
   - Remove if not needed

### Long-term Considerations

6. **React 19 Migration**
   - Wait for ecosystem maturity
   - Test with major dependencies first
   - Update when Radix UI fully supports React 19

7. **Dependency Management Best Practices**
   - Use `npm install --save-exact` for critical dependencies
   - Regular monthly audits using `npm outdated` and `npm audit`
   - Consider using `depcheck` to identify unused dependencies:
     ```bash
     npx depcheck
     ```
   - Implement pre-commit hooks for security scanning

---

## 5. Risk Assessment

### Low Risk Changes
✅ Removing unused UI components and dependencies
✅ Minor version updates (lucide-react, next-themes)
✅ Security patches via `npm audit fix`
✅ Vite update to latest

### Medium Risk Changes
⚠️ Major version updates (zod, @hookform/resolvers, react-router-dom)
⚠️ date-fns v4 update
⚠️ recharts v3 update

### High Risk Changes
🔴 React 18 → React 19 migration
🔴 react-router-dom v6 → v7 (major routing changes)
🔴 react-day-picker v8 → v9 (major API changes)

---

## 6. Testing Checklist

After making changes, verify:

- [ ] `npm install` completes without errors
- [ ] `npm run build` succeeds
- [ ] `npm run dev` starts development server
- [ ] All existing features work correctly
- [ ] No console errors or warnings
- [ ] Forms validation works (react-hook-form + zod)
- [ ] Routing works correctly
- [ ] UI components render properly
- [ ] No regressions in functionality

---

## 7. Implementation Script

```bash
#!/bin/bash
# Dependency Cleanup and Security Update Script

echo "📋 Step 1: Backup package.json"
cp package.json package.json.backup

echo "🔒 Step 2: Fix security vulnerabilities"
npm audit fix
npm install vite@latest

echo "🧹 Step 3: Remove unused UI components"
rm -f src/components/ui/accordion.tsx
rm -f src/components/ui/aspect-ratio.tsx
rm -f src/components/ui/avatar.tsx
rm -f src/components/ui/breadcrumb.tsx
rm -f src/components/ui/chart.tsx
rm -f src/components/ui/checkbox.tsx
rm -f src/components/ui/context-menu.tsx
rm -f src/components/ui/drawer.tsx
rm -f src/components/ui/dropdown-menu.tsx
rm -f src/components/ui/hover-card.tsx
rm -f src/components/ui/input-otp.tsx
rm -f src/components/ui/menubar.tsx
rm -f src/components/ui/navigation-menu.tsx
rm -f src/components/ui/popover.tsx
rm -f src/components/ui/progress.tsx
rm -f src/components/ui/radio-group.tsx
rm -f src/components/ui/resizable.tsx
rm -f src/components/ui/scroll-area.tsx
rm -f src/components/ui/slider.tsx
rm -f src/components/ui/switch.tsx
rm -f src/components/ui/table.tsx
rm -f src/components/ui/tabs.tsx
rm -f src/components/ui/textarea.tsx

echo "📦 Step 4: Uninstall unused Radix dependencies"
npm uninstall @radix-ui/react-accordion \
  @radix-ui/react-aspect-ratio \
  @radix-ui/react-avatar \
  @radix-ui/react-checkbox \
  @radix-ui/react-context-menu \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-hover-card \
  @radix-ui/react-menubar \
  @radix-ui/react-navigation-menu \
  @radix-ui/react-popover \
  @radix-ui/react-progress \
  @radix-ui/react-radio-group \
  @radix-ui/react-scroll-area \
  @radix-ui/react-slider \
  @radix-ui/react-switch \
  @radix-ui/react-tabs \
  @radix-ui/react-toggle \
  @radix-ui/react-toggle-group

echo "⬆️  Step 5: Update minor versions"
npm update lucide-react next-themes

echo "✅ Step 6: Verify installation"
npm install
npm run build

echo "✨ Cleanup complete! Please test the application."
echo "If issues occur, restore with: cp package.json.backup package.json && npm install"
```

---

## Conclusion

This audit identified significant opportunities for improvement:

1. **Security**: 4 vulnerabilities need immediate patching
2. **Bloat**: ~60% of UI dependencies are unused (18/30 Radix packages)
3. **Maintenance**: 14 packages have major updates available
4. **Bundle Size**: Potential 200-400 KB reduction

**Recommended priority**: Security fixes → Remove bloat → Update packages → Consider React 19

Estimated effort: 2-4 hours for immediate actions, 1-2 days for complete updates with testing.
