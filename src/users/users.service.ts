import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  findByEmail(email: string) {
    return this.userModel.findOne({ email });
  }

  findByEmailWithPasswordHash(email: string) {
    return this.userModel.findOne({ email }).select('+password_hash');
  }

  create(
    email: string,
    password_hash: string,
    name: string,
    role: string = 'user',
  ) {
    return this.userModel.create({
      email,
      password_hash,
      name,
      is_active: true,
      roles: [role],
    });
  }

  updateOne(filter: any, update: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.userModel.updateOne(filter, update);
  }

  findOne(filter: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.userModel.findOne(filter);
  }
}
