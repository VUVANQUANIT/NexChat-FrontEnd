import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-toast',
    imports: [CommonModule],
    template: `
        <div class="fixed top-4 right-4 z-50 flex flex-col space-y-2">
            @for (toast of toastService.toasts(); track toast.id) {
                <div [class]="getToastClass(toast.type)" 
                     class="px-4 py-2 rounded-md shadow-lg flex items-center justify-between min-w-[200px] animate-fade-in-down">
                    <span class="text-sm font-medium">{{ toast.message }}</span>
                    <button (click)="toastService.remove(toast.id)" class="ml-4 text-white hover:opacity-75 focus:outline-none">
                        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            }
        </div>
    `,
    styles: [`
        @keyframes fade-in-down {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-down {
            animation: fade-in-down 0.3s ease-out;
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToastComponent {
    protected readonly toastService = inject(ToastService);

    getToastClass(type: string): string {
        switch (type) {
            case 'success': return 'bg-green-600 text-white';
            case 'error': return 'bg-red-600 text-white';
            case 'warning': return 'bg-yellow-500 text-white';
            case 'info': return 'bg-blue-600 text-white';
            default: return 'bg-gray-800 text-white';
        }
    }
}