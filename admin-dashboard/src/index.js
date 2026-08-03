/*!

=========================================================
* Purity UI Dashboard - v1.0.1
=========================================================

* Product Page: https://www.creative-tim.com/product/purity-ui-dashboard
* Copyright 2021 Creative Tim (https://www.creative-tim.com)
* Licensed under MIT (https://github.com/creativetimofficial/purity-ui-dashboard/blob/master/LICENSE.md)

* Design by Creative Tim & Coded by Simmmple

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
import { createRoot } from 'react-dom/client'
import { lazy, Suspense } from 'react'

import { HashRouter, Redirect, Route, Switch } from 'react-router-dom'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'

const AdminLayout = lazy(() => import('layouts/Admin.js'))
const AuthLayout = lazy(() => import('layouts/Auth.js'))
const RTLLayout = lazy(() => import('layouts/RTL.js'))
const ReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? lazy(() =>
        import('@tanstack/react-query-devtools').then((module) => ({
          default: module.ReactQueryDevtools,
        }))
      )
    : null

const queryClient = new QueryClient()

const root = createRoot(document.getElementById('root'))
root.render(
  <QueryClientProvider client={queryClient}>
    <HashRouter>
      <Suspense fallback={<div className="app-route-loader">Loading Pax Logistics…</div>}>
        <Switch>
          <Route path={`/auth`} component={AuthLayout} />
          <Route path={`/admin`} component={AdminLayout} />
          <Route path={`/rtl`} component={RTLLayout} />
          <Redirect from={`/`} to="/admin/dashboard" />
        </Switch>
      </Suspense>
    </HashRouter>

    {/* 🛠 Devtools (optional, helpful during development) */}
    {ReactQueryDevtools ? (
      <Suspense fallback={null}>
        <ReactQueryDevtools initialIsOpen={false} />
      </Suspense>
    ) : null}
  </QueryClientProvider>
)
