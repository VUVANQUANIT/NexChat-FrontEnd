import { Component, OnInit, ChangeDetectionStrategy, output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../services/user.service';
import { FriendshipService, FriendRequest, FriendSummary } from '../../../services/friendship.service';
import { UserProfile, AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { ChatService } from '../../../services/chat.service';

type FriendsTab = 'friends' | 'requests' | 'find';

@Component({
    selector: 'app-friends-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './friends-modal.component.html',
    styleUrls: ['./friends-modal.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriendsModalComponent implements OnInit {
    private readonly userService = inject(UserService);
    private readonly friendshipService = inject(FriendshipService);
    private readonly toastService = inject(ToastService);
    private readonly authService = inject(AuthService);
    private readonly chatService = inject(ChatService);

    readonly currentUser = this.authService.currentUser;

    closed = output<void>();
    pendingCountChanged = output<void>();
    /** Opened conversation from friend list. */
    openChat = output<number>();

    activeTab = signal<FriendsTab>('friends');

    friends = signal<FriendSummary[]>([]);
    isLoadingFriends = signal(false);

    friendRequests = signal<FriendRequest[]>([]);
    isLoadingRequests = signal(false);

    findQuery = '';
    findResults = signal<UserProfile[]>([]);
    isSearching = signal(false);
    requestingIds = signal<number[]>([]);

    readonly canShowFindHint = computed(() => this.findQuery.trim().length < 2);

    async ngOnInit(): Promise<void> {
        await Promise.all([this.loadFriends(), this.loadRequests()]);
    }

    close(): void {
        this.closed.emit();
    }

    setTab(tab: FriendsTab): void {
        this.activeTab.set(tab);
    }

    async loadFriends(): Promise<void> {
        const uid = this.currentUser()?.id;
        if (uid == null) return;
        this.isLoadingFriends.set(true);
        try {
            const list = await this.friendshipService.listAcceptedFriends(uid);
            this.friends.set(list);
        } catch (e) {
            this.toastService.handleBackendError(e);
        } finally {
            this.isLoadingFriends.set(false);
        }
    }

    async loadRequests(): Promise<void> {
        this.isLoadingRequests.set(true);
        try {
            const res = await this.friendshipService.getRequests('PENDING', 'RECEIVED', 0, 50);
            this.friendRequests.set(res.content);
        } catch (e) {
            this.toastService.handleBackendError(e);
        } finally {
            this.isLoadingRequests.set(false);
        }
    }

    async onFindSearch(): Promise<void> {
        const q = this.findQuery.trim();
        if (q.length < 2) {
            this.findResults.set([]);
            return;
        }
        this.isSearching.set(true);
        try {
            const res = await this.userService.searchUsers(q);
            const me = this.currentUser()?.id;
            this.findResults.set(res.content.filter(u => u.id !== me));
        } catch (e) {
            this.toastService.handleBackendError(e);
        } finally {
            this.isSearching.set(false);
        }
    }

    async sendRequest(userId: number): Promise<void> {
        if (this.requestingIds().includes(userId)) return;
        this.requestingIds.update(a => [...a, userId]);
        try {
            await this.friendshipService.sendRequest(userId);
            this.findResults.update(list => list.filter(u => u.id !== userId));
            this.toastService.success('Đã gửi lời mời kết bạn');
        } catch (e) {
            this.toastService.handleBackendError(e);
        } finally {
            this.requestingIds.update(a => a.filter(id => id !== userId));
        }
    }

    async acceptRequest(id: number): Promise<void> {
        try {
            await this.friendshipService.acceptRequest(id);
            this.friendRequests.update(reqs => reqs.filter(r => r.id !== id));
            this.toastService.success('Đã chấp nhận');
            this.pendingCountChanged.emit();
            await this.loadFriends();
        } catch (e) {
            this.toastService.handleBackendError(e);
        }
    }

    async rejectRequest(id: number): Promise<void> {
        try {
            await this.friendshipService.rejectRequest(id);
            this.friendRequests.update(reqs => reqs.filter(r => r.id !== id));
            this.pendingCountChanged.emit();
        } catch (e) {
            this.toastService.handleBackendError(e);
        }
    }

    async startChatWithFriend(friend: FriendSummary): Promise<void> {
        try {
            const conv = await this.chatService.createDirectConversation(friend.id);
            this.openChat.emit(conv.id);
            this.close();
        } catch (e) {
            this.toastService.handleBackendError(e);
        }
    }
}
