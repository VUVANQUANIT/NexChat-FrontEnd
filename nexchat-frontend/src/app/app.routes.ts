import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
    {
        path: 'login',
        loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent)
    },
    {
        path: 'register',
        loadComponent: () => import('./components/register/register.component').then(m => m.RegisterComponent)
    },
    {
        path: 'friends',
        loadComponent: () => import('./components/friends/friends.component').then(m => m.FriendsComponent),
        canActivate: [AuthGuard]
    },
    {
        path: 'inbox/:conversationId',
        loadComponent: () => import('./components/inbox/inbox.component').then(m => m.InboxComponent),
        canActivate: [AuthGuard]
    },
    {
        path: 'inbox',
        loadComponent: () => import('./components/inbox/inbox.component').then(m => m.InboxComponent),
        canActivate: [AuthGuard]
    },
    {
        path: 'chat/:id',
        loadComponent: () => import('./components/chat/chat.component').then(m => m.ChatComponent),
        canActivate: [AuthGuard]
    },
    {
        path: '',
        redirectTo: '/inbox',
        pathMatch: 'full'
    },
    {
        path: '**',
        redirectTo: '/inbox'
    }
];
