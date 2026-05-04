import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserService } from '../../../services/user.service';
import { FriendshipService, FriendRequest } from '../../../services/friendship.service';
import { UserProfile, AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriendsComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly friendshipService = inject(FriendshipService);
  private readonly toastService = inject(ToastService);
  readonly currentUser = inject(AuthService).currentUser;

  searchQuery = signal('');
  searchResults = signal<UserProfile[]>([]);
  isSearching = signal(false);

  friendRequests = signal<FriendRequest[]>([]);
  isLoadingRequests = signal(false);

  async ngOnInit() {
    await this.loadFriendRequests();
  }

  async onSearch() {
    if (this.searchQuery().trim().length < 2) {
      this.searchResults.set([]);
      return;
    }

    this.isSearching.set(true);
    try {
      const res = await this.userService.searchUsers(this.searchQuery().trim());
      this.searchResults.set(res.content);
    } catch (e: any) {
      this.toastService.handleBackendError(e);
    } finally {
      this.isSearching.set(false);
    }
  }

  async sendRequest(userId: number) {
    try {
      await this.friendshipService.sendRequest(userId);
      this.searchResults.update(results => results.filter(u => u.id !== userId));
      this.toastService.success('Friend request sent!');
    } catch (e: any) {
      this.toastService.handleBackendError(e);
    }
  }

  async loadFriendRequests() {
    this.isLoadingRequests.set(true);
    try {
      const res = await this.friendshipService.getRequests('PENDING', 'RECEIVED');
      this.friendRequests.set(res.content);
    } catch (e: any) {
      this.toastService.handleBackendError(e);
    } finally {
      this.isLoadingRequests.set(false);
    }
  }

  async acceptRequest(id: number) {
    try {
      await this.friendshipService.acceptRequest(id);
      this.friendRequests.update(reqs => reqs.filter(r => r.id !== id));
      this.toastService.success('Friend request accepted!');
    } catch (e: any) {
      this.toastService.handleBackendError(e);
    }
  }

  async rejectRequest(id: number) {
    try {
      await this.friendshipService.rejectRequest(id);
      this.friendRequests.update(reqs => reqs.filter(r => r.id !== id));
      this.toastService.success('Friend request rejected');
    } catch (e: any) {
      this.toastService.handleBackendError(e);
    }
  }
}
